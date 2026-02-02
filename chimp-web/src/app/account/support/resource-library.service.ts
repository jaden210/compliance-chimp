import { Injectable, inject } from "@angular/core";
import { Firestore, collection, collectionData, doc, updateDoc, addDoc, deleteDoc, query, orderBy } from "@angular/fire/firestore";
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from "@angular/fire/storage";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";

export class ResourceFile {
  id?: string;
  fileUrl: string;
  name: string;
  description?: string;
  sourceUrl?: string;
  createdAt: any;
  updatedAt: any;
  uploadedBy: string;
  type?: string;
  order?: number;
}

@Injectable({
  providedIn: "root"
})
export class ResourceLibraryService {
  private readonly db = inject(Firestore);
  private readonly storage = inject(Storage);

  private readonly collectionPath = "resource-library";
  private readonly storagePath = "resource-library";

  getResourceFiles(): Observable<ResourceFile[]> {
    const resourceQuery = query(
      collection(this.db, this.collectionPath),
      orderBy("order", "asc")
    );
    return collectionData(resourceQuery, { idField: "id" }).pipe(
      map((files: any[]) =>
        files.map((file) => ({
          ...file,
          createdAt: file.createdAt?.toDate ? file.createdAt.toDate() : file.createdAt,
          updatedAt: file.updatedAt?.toDate ? file.updatedAt.toDate() : file.updatedAt
        }))
      )
    );
  }

  async uploadResourceFile(file: File, uploadedBy: string, name?: string, description?: string, sourceUrl?: string): Promise<ResourceFile> {
    const timestamp = new Date().getTime();
    const filePath = `${this.storagePath}/${timestamp}_${file.name}`;
    const storageRef = ref(this.storage, filePath);

    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    // Get current max order
    const files = await new Promise<ResourceFile[]>((resolve) => {
      this.getResourceFiles().subscribe((f) => resolve(f));
    });
    const maxOrder = files.length > 0 ? Math.max(...files.map(f => f.order || 0)) : 0;

    const resourceFile: Partial<ResourceFile> = {
      fileUrl: url,
      name: name || file.name,
      description: description || "",
      sourceUrl: sourceUrl || "",
      createdAt: new Date(),
      updatedAt: new Date(),
      uploadedBy: uploadedBy,
      type: file.type,
      order: maxOrder + 1
    };

    const cleanedFile = Object.fromEntries(
      Object.entries(resourceFile).filter(([_, v]) => v !== undefined)
    );

    const docRef = await addDoc(collection(this.db, this.collectionPath), cleanedFile);
    
    return {
      ...resourceFile,
      id: docRef.id
    } as ResourceFile;
  }

  async updateResourceFile(file: ResourceFile): Promise<void> {
    if (!file.id) throw new Error("File ID is required for update");

    const updateData: Partial<ResourceFile> = {
      name: file.name,
      description: file.description,
      sourceUrl: file.sourceUrl,
      order: file.order,
      updatedAt: new Date()
    };

    const cleanedData = Object.fromEntries(
      Object.entries(updateData).filter(([_, v]) => v !== undefined)
    );

    await updateDoc(doc(this.db, this.collectionPath, file.id), cleanedData);
  }

  async deleteResourceFile(file: ResourceFile): Promise<void> {
    if (!file.id) throw new Error("File ID is required for delete");

    // Delete from Firestore first
    await deleteDoc(doc(this.db, this.collectionPath, file.id));

    // Try to delete from storage (may fail if URL format doesn't match expected pattern)
    try {
      if (file.fileUrl) {
        // Extract storage path from URL
        const urlParts = file.fileUrl.split('/o/');
        if (urlParts.length > 1) {
          const encodedPath = urlParts[1].split('?')[0];
          const storagePath = decodeURIComponent(encodedPath);
          const storageRef = ref(this.storage, storagePath);
          await deleteObject(storageRef);
        }
      }
    } catch (error) {
      console.warn("Could not delete file from storage:", error);
      // Continue anyway - Firestore record is deleted
    }
  }

  async reorderFiles(files: ResourceFile[]): Promise<void> {
    const updates = files.map((file, index) => {
      return updateDoc(doc(this.db, this.collectionPath, file.id!), {
        order: index + 1,
        updatedAt: new Date()
      });
    });
    await Promise.all(updates);
  }
}
