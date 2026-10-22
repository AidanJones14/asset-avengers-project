"""Call the running internal API and Superset with short-lived test-only JWTs."""
import base64
import hashlib
import hmac
import json
import os
import time
from urllib.request import Request,build_opener,HTTPCookieProcessor
from http.cookiejar import CookieJar
from urllib.error import HTTPError
import psycopg


# Preserve the CSRF session when testing Superset chart POSTs.
opener=build_opener(HTTPCookieProcessor(CookieJar()))

def token(role):
    enc=lambda data:base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b'=')
    body=b'.'.join([enc({'alg':'HS256','typ':'JWT'}),enc({'sub':'00000000-0000-0000-0000-000000000009',
        'email':'staff@example.invalid','roles':[role],'amr':['pwd','mfa'],'mfa_required':True,'iss':'endgame-auth',
        # Shaped like auth-server's staff tokens: MFA proof and the staff service's audience.
        'aud':['endgame-api','endgame-auth','endgame-staff'],
        'iat':int(time.time()),'exp':int(time.time())+300})])
    signature=base64.urlsafe_b64encode(hmac.new(os.environ['TEST_JWT_SECRET'].encode(),body,hashlib.sha256).digest()).rstrip(b'=')
    return (body+b'.'+signature).decode()


def request(path,role='ADMIN',method='GET',host='http://internal-backend:8085',headers=None,data=None):
    headers=headers or {'Authorization':'Bearer '+token(role)}
    if method=='POST' and data is None: data=b'{}'
    headers['Content-Type']='application/json'
    try:
        with opener.open(Request(host+path,headers=headers,method=method,data=data),timeout=30) as response:
            return response.status,json.load(response)
    except HTTPError as error:
        return error.code,error.read().decode()


for attempt in range(60):
    try:
        status,payload=request('/api/v1/analytics/status','ANALYST')
        if status==200: break
    except OSError: pass
    time.sleep(1)
assert status==200,payload
# Shared schedule writes require a staff JWT and preserve today's cutoff.
status,schedule=request('/api/v1/analytics/report-schedule','ANALYST')
assert status==200 and schedule['currentLocalTime']=='19:00',schedule
status,saved=request('/api/v1/analytics/report-schedule','ANALYST','PUT',data=b'{"localTime":"17:30"}')
assert status==200 and saved['currentLocalTime']=='19:00' and saved['nextLocalTime']=='17:30',saved
assert request('/api/v1/analytics/report-schedule','ADMIN')[1]['nextLocalTime']=='17:30'
assert request('/api/v1/analytics/report-schedule','CLIENT','PUT',data=b'{"localTime":"18:00"}')[0]==403
assert request('/api/v1/analytics/report-schedule','ANALYST','PUT',data=b'{"localTime":"24:00"}')[0]==400
# Exercise the actual Nginx UI proxy as well as the internal backend directly.
with opener.open('http://internal-frontend/admin.html',timeout=30) as response:
    assert response.status==200 and '<staff-app>' in response.read().decode()
assert request('/api/v1/analytics/status','ANALYST',host='http://internal-frontend')[0]==200
assert request('/api/v1/admin/trades','ANALYST',host='http://internal-frontend')[0]==403
assert request('/api/v1/admin/trades','CLIENT')[0]==403
assert request('/api/v1/admin/trades','ANALYST')[0]==403
status,timeline=request('/api/v1/admin/orders/30000000-0000-0000-0000-000000000001/timeline')
assert status==200,timeline
assert timeline['order']['status']=='filled'
status,pricing=request('/api/v1/admin/orders/30000000-0000-0000-0000-000000000001/pricing')
assert status==200 and pricing[0]['quote']['stale'] is True,pricing
status,evidence=request('/api/v1/admin/orders/30000000-0000-0000-0000-000000000001/export')
assert status==200,evidence
assert evidence['order']['status']=='filled' and evidence['events'],evidence
assert evidence['pricing'][0]['quote']['stale'] is True,evidence
assert evidence['cashMovements'][0]['cashDelta']==-100,evidence
status,trades=request('/api/v1/admin/trades?orderId=30000000-0000-0000-0000-000000000001&status=filled')
assert status==200 and trades['page']['totalElements']==1,trades
assert request('/api/v1/admin/trades?size=101')[0]==400
status,guest=request('/api/v1/analytics/dashboards/business-overview/guest-token','ANALYST','POST')
assert status==200,guest
assert guest.get('guestToken') and guest.get('dashboardId'),guest
assert request('/api/v1/analytics/dashboards/unapproved/guest-token','ANALYST','POST')[0]==404
# Exercise Superset's own guest permissions against an actual chart query.
with psycopg.connect(host='reporting-db',dbname='superset_metadata',user='postgres',password=os.environ['TEST_DB_PASSWORD']) as connection:
    chart_id,dataset_id=connection.execute("SELECT id,datasource_id FROM slices WHERE slice_name='Business overview: Summary'").fetchone()
body=json.dumps({'datasource':{'id':dataset_id,'type':'table'},'force':True,'queries':[{
    'columns':['report_date'],'metrics':['trade_count','traded_notional'],'row_limit':1000,
    'filters':[],'extras':{'having':'','where':''},'time_range':'No filter'}],
    'form_data':{'slice_id':chart_id},'result_format':'json','result_type':'full'}).encode()
status,csrf=request('/api/v1/security/csrf_token/',host='http://superset:8088',headers={'X-GuestToken':guest['guestToken']})
assert status==200,csrf
status,chart=request('/api/v1/chart/data',method='POST',host='http://superset:8088',
    headers={'X-GuestToken':guest['guestToken'],'X-CSRFToken':csrf['result']},data=body)
assert status==200,chart
assert chart['result'][0]['data'][0]['traded_notional']==100,chart
print('Passed: real staff JWT checks, audit APIs, Superset guest token and dashboard chart query')
