import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { NgForm } from '@angular/forms';
import { DisputeForm } from './dispute-form';

describe('Dispute filing', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [DisputeForm], providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  function setup() {
    const fixture = TestBed.createComponent(DisputeForm);
    fixture.componentRef.setInput('orders', []);
    fixture.componentRef.setInput('accountId', 'active-account');
    TestBed.inject(HttpTestingController).expectOne('/api/v1/me/disputes').flush([]);
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
});
