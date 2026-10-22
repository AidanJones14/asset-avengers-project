import { TestBed } from '@angular/core/testing';
import { Instrument } from '../../../api/instruments/instrument';
import { InstrumentLogo, LOGOKIT_TOKEN, logoUrl } from './instrument-logo';
const instrument = (symbol: string) => ({ symbol } as Instrument);
describe('instrument logos', () => {
  it('uses canonical stock, India and crypto identifiers', () => {
    expect(logoUrl(instrument('AAPL'), 'pk_test')).toContain('/ticker/AAPL?');
    expect(logoUrl(instrument('INFY.NS'), 'pk_test')).toContain('/ticker/INFY.NS?');
    expect(logoUrl(instrument('X:BTC-USD'), 'pk_test')).toContain('/crypto/BTC?');
    expect(logoUrl(instrument('AAPL'), 'sk_secret')).toBeNull();
    expect(logoUrl(instrument('AAPL'), 'pk_REPLACE_WITH_YOUR_LOGOKIT_TOKEN')).toBeNull();
  });
  it('keeps initials when unconfigured without requesting an image', () => {
    TestBed.configureTestingModule({providers:[{provide:LOGOKIT_TOKEN,useValue:''}]});
    const fixture=TestBed.createComponent(InstrumentLogo);
    fixture.componentRef.setInput('instrument', instrument('AAPL'));fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('AA');
  });
  it('falls back on image failure and retries when the instrument changes', () => {
    TestBed.configureTestingModule({providers:[{provide:LOGOKIT_TOKEN,useValue:'pk_test'}]});
    const fixture=TestBed.createComponent(InstrumentLogo);
    fixture.componentRef.setInput('instrument', instrument('AAPL'));fixture.detectChanges();
    fixture.nativeElement.querySelector('img').dispatchEvent(new Event('error'));fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    fixture.componentRef.setInput('instrument', instrument('MSFT'));fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toContain('/ticker/MSFT?');
  });
});
