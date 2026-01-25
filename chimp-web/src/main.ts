import { bootstrapApplication } from "@angular/platform-browser";
import { enableProdMode, APP_INITIALIZER } from "@angular/core";
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from "@angular/router";
import { provideAnimations } from "@angular/platform-browser/animations";
import { provideHttpClient } from "@angular/common/http";
import { MatIconRegistry } from "@angular/material/icon";
import { provideFirebaseApp, initializeApp } from "@angular/fire/app";
import { provideAuth, getAuth } from "@angular/fire/auth";
import { provideStorage, getStorage } from "@angular/fire/storage";
import { provideFirestore, getFirestore } from "@angular/fire/firestore";
import { provideFunctions, getFunctions } from "@angular/fire/functions";
import { environment } from "./environments/environment";
import { AppComponent } from "./app/app.component";
import { appRoutes } from "./app/app.routes";
import { SeoService } from "./app/shared/seo.service";

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withInMemoryScrolling({ anchorScrolling: 'enabled' })
    ),
    provideAnimations(),
    provideHttpClient(),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideAuth(() => getAuth()),
    provideStorage(() => getStorage()),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => getFunctions()),
    {
      provide: APP_INITIALIZER,
      useFactory: (iconRegistry: MatIconRegistry) => () => {
        iconRegistry.setDefaultFontSetClass('material-symbols-outlined');
      },
      deps: [MatIconRegistry],
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (seoService: SeoService) => () => {
        // Initialize SEO service to start listening to route changes
        return seoService;
      },
      deps: [SeoService],
      multi: true
    }
  ]
}).catch((err) => console.error(err));
