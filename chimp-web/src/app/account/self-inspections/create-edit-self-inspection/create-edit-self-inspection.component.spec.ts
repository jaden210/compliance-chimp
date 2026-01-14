import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateEditSelfInspectionComponent } from './create-edit-self-inspection.component';

describe('CreateEditSelfInspectionComponent', () => {
  let component: CreateEditSelfInspectionComponent;
  let fixture: ComponentFixture<CreateEditSelfInspectionComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ CreateEditSelfInspectionComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CreateEditSelfInspectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
