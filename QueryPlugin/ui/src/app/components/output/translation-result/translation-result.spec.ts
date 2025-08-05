import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationResult } from './translation-result';

describe('TranslationResult', () => {
  let component: TranslationResult;
  let fixture: ComponentFixture<TranslationResult>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslationResult]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TranslationResult);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
