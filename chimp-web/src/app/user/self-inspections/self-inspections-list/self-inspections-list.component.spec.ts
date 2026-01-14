import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SelfInspectionsListComponent } from './self-inspections-list.component';

describe('SelfInspectionsListComponent', () => {
  let component: SelfInspectionsListComponent;
  let fixture: ComponentFixture<SelfInspectionsListComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ SelfInspectionsListComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SelfInspectionsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
