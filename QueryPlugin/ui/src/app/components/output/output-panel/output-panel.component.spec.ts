import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OutputPanel } from './output-panel.component';

describe('Panel', () => {
  let component: OutputPanel;
  let fixture: ComponentFixture<OutputPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OutputPanel]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OutputPanel);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
