import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { MakeOSHAComponent } from './make-osha.component';

describe('MakeOSHAComponent', () => {
  let component: MakeOSHAComponent;
  let fixture: ComponentFixture<MakeOSHAComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ MakeOSHAComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MakeOSHAComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
