import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditorButtons } from './editor-buttons';

describe('EditorButtons', () => {
  let component: EditorButtons;
  let fixture: ComponentFixture<EditorButtons>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorButtons]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditorButtons);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
