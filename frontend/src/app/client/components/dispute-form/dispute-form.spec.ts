import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AccountApiService } from '../../../api/accounts/account-api.service';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { NgForm } from '@angular/forms';
import { DisputeForm } from './dispute-form';

describe('Dispute filing', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [DisputeForm], providers: [provideHttpClient(), provideHttpClientTesting(),
    {provide:AccountApiService,useValue:{accounts:signal([
      {accountId:'active-account',accountName:'Main investing',accountType:'Individual Brokerage'},
      {accountId:'roth-account',accountName:'My retirement',accountType:'Roth IRA'}]),getAccounts:()=>of([])}}] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  function setup() {
    const fixture = TestBed.createComponent(DisputeForm);
    fixture.componentRef.setInput('orders', []);
    fixture.componentRef.setInput('accountId', 'active-account');
    TestBed.inject(HttpTestingController).expectOne('/api/v1/me/disputes').flush([]);
    fixture.detectChanges();
    return fixture;
  }
  it('keeps the form available without orders and saves only once with a reference', () => {
    const fixture = setup(); const component = fixture.componentInstance;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('File a dispute');
    component.category = 'funding'; component.description = 'My deposit is not reflected in my available balance.';
    const form = { invalid: false, resetForm: vi.fn() } as unknown as NgForm;
    component.submit(form); component.submit(form);
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/me/disputes');
    expect(request.request.body).toEqual({ accountId: 'active-account', orderId: null, category: 'funding', description: component.description });
    request.flush({ disputeId: 'reference', status: 'submitted', category: 'funding', description: component.description, createdAt: '2026-10-19T12:00:00Z' });
    expect(component.confirmation()).toContain('reference'); expect(component.disputes()).toHaveLength(1);
    expect(form.resetForm).toHaveBeenCalled();
  });
  it('labels related orders with trade details and dates instead of UUIDs', () => {
    const fixture = setup();
    fixture.componentRef.setInput('orders', [{ id: 'private-order-uuid', symbol: 'AAPL', side: 'buy', quantity: 2, total: 200, status: 'filled', submittedAt: '2026-10-19T12:30:00Z' }]);
    fixture.detectChanges();
    const option = fixture.nativeElement.querySelector('#dispute-order option[value="private-order-uuid"]');
    expect(option.textContent).toContain('AAPL · Buy 2 shares');
    expect(option.textContent).toContain('Oct 19, 2026');
    expect(option.textContent).toContain('filled');
    expect(option.textContent).not.toContain('private-order-uuid');
  });
  it('preserves details on failure and rejects an empty explanation', () => {
    const fixture = setup(); const component = fixture.componentInstance;
    const form = { invalid: false } as NgForm;
    component.description = '   '; component.submit(form);
    TestBed.inject(HttpTestingController).expectNone('/api/v1/me/disputes');
    component.category = 'pricing'; component.description = 'The execution amount differs from the recorded quote.';
    component.submit(form);
    TestBed.inject(HttpTestingController).expectOne('/api/v1/me/disputes').flush({}, {status: 503, statusText: 'Unavailable'});
    expect(component.pending()).toBe(false); expect(component.description).toContain('execution');
    expect(component.error()).toContain('try again'); expect(component.confirmation()).toBe('');
  });
  it('allows a different owned investment account and sends its ID with the dispute', async () => {
    const fixture=setup();const component=fixture.componentInstance;
    await fixture.whenStable();
    const select=fixture.nativeElement.querySelector('#dispute-investment-account') as HTMLSelectElement;
    expect(select.textContent).toContain('My retirement · Roth IRA');
    select.value='roth-account';select.dispatchEvent(new Event('change'));fixture.detectChanges();
    const related=TestBed.inject(HttpTestingController).expectOne('/api/v1/orders?accountId=roth-account');
    related.flush([{orderId:'roth-order',accountId:'roth-account',instrumentId:'aapl',orderSide:'buy',quantity:1,price:100,status:'filled'}]);
    await fixture.whenStable();
    expect(component.availableOrders().map(o=>o.id)).toEqual(['roth-order']);
    component.category='funding';component.description='My Roth IRA contribution is not reflected in my balance.';
    component.submit({invalid:false,resetForm:vi.fn()} as unknown as NgForm);
    const request=TestBed.inject(HttpTestingController).expectOne('/api/v1/me/disputes');
    expect(request.request.body.accountId).toBe('roth-account');
    request.flush({disputeId:'roth-reference',accountId:'roth-account',status:'submitted'});
  });
  it('does not submit an account that is absent from the owned account list', () => {
    const fixture=setup();const component=fixture.componentInstance;
    component.selectAccount('another-clients-account');component.category='funding';
    component.description='Please investigate the contribution recorded against this account.';
    component.submit({invalid:false} as NgForm);
    TestBed.inject(HttpTestingController).expectNone('/api/v1/me/disputes');
    expect(component.error()).toContain('Select the investment account');
  });

});
