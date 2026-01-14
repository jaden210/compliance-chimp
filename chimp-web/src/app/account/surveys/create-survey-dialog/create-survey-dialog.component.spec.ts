import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateSurveyDialogComponent } from './create-survey-dialog.component';

describe('CreateSurveyDialogComponent', () => {
  let component: CreateSurveyDialogComponent;
  let fixture: ComponentFixture<CreateSurveyDialogComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ CreateSurveyDialogComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CreateSurveyDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
