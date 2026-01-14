import { async, ComponentFixture, TestBed } from "@angular/core/testing";

import { SelfInspectionsComponent } from "./self-inspections.component";

describe("SelfInspectionsComponent", () => {
  let component: SelfInspectionsComponent;
  let fixture: ComponentFixture<SelfInspectionsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [SelfInspectionsComponent]
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SelfInspectionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
