import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatInputModule } from '@angular/material/input';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { getTagColor } from '../../../shared/tag-colors';

@Component({
  standalone: true,
  selector: 'app-tag-input',
  templateUrl: './tag-input.component.html',
  styleUrls: ['./tag-input.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    MatChipsModule,
    MatIconModule,
    MatFormFieldModule,
    MatAutocompleteModule,
    MatInputModule
  ]
})
export class TagInputComponent implements OnInit, OnChanges {
  @Input() tags: string[] = [];
  @Input() allTags: string[] = []; // All available tags for autocomplete
  @Input() placeholder: string = 'Add tag...';
  @Input() compact: boolean = false;
  @Output() tagsChange = new EventEmitter<string[]>();
  @Output() enterSubmit = new EventEmitter<void>(); // Emits when Enter is pressed with empty input
  
  @ViewChild('tagInput') tagInput: ElementRef<HTMLInputElement>;
  
  separatorKeyCodes: number[] = [ENTER, COMMA];
  inputValue: string = '';
  filteredTags: string[] = [];
  
  // Use shared tag color utility
  getTagColor = getTagColor;

  ngOnInit() {
    this.updateFilteredTags();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['allTags'] || changes['tags']) {
      this.updateFilteredTags();
    }
  }

  updateFilteredTags(): void {
    const currentInput = (this.inputValue || '').toLowerCase().trim();
    this.filteredTags = this.allTags
      .filter(tag => !this.tags.includes(tag)) // Exclude already selected
      .filter(tag => tag.toLowerCase().includes(currentInput)); // Match input
  }

  onInputChange(): void {
    this.updateFilteredTags();
  }

  addTag(value: string): void {
    const tag = (value || '').trim();
    if (tag && !this.tags.includes(tag)) {
      this.tags = [...this.tags, tag];
      this.tagsChange.emit(this.tags);
    }
    this.inputValue = '';
    this.updateFilteredTags();
    if (this.tagInput) {
      this.tagInput.nativeElement.value = '';
    }
  }

  removeTag(tag: string): void {
    const index = this.tags.indexOf(tag);
    if (index >= 0) {
      this.tags = this.tags.filter(t => t !== tag);
      this.tagsChange.emit(this.tags);
      this.updateFilteredTags();
    }
  }

  selected(event: MatAutocompleteSelectedEvent): void {
    this.addTag(event.option.value);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      if (this.inputValue.trim()) {
        this.addTag(this.inputValue);
      } else if (event.key === 'Enter') {
        // If input is empty and Enter is pressed, emit submit event for form submission
        this.enterSubmit.emit();
      }
    }
  }
}
