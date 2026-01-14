import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CommonQuestionsComponent } from './common-questions.component';

describe('CommonQuestionsComponent', () => {
  let component: CommonQuestionsComponent;
  let fixture: ComponentFixture<CommonQuestionsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ CommonQuestionsComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CommonQuestionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
