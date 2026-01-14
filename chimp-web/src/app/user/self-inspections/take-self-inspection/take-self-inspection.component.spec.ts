import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { TakeSelfInspectionComponent } from './take-self-inspection.component';

describe('TakeSelfInspectionComponent', () => {
  let component: TakeSelfInspectionComponent;
  let fixture: ComponentFixture<TakeSelfInspectionComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ TakeSelfInspectionComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(TakeSelfInspectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
