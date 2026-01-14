import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ChimpBookComponent } from './chimp-book.component';

describe('ChimpBookComponent', () => {
  let component: ChimpBookComponent;
  let fixture: ComponentFixture<ChimpBookComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ChimpBookComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ChimpBookComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
