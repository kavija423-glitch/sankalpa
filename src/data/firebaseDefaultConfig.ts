export interface FirebaseConfigObject {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
}

export const DEFAULT_FIREBASE_CONFIG: FirebaseConfigObject = {
  apiKey: 'AIzaSyBLjI8Ol87-vnW-5CenGPc8RFP0SOv_hQA',
  authDomain: 'sankalpa-45fda.firebaseapp.com',
  projectId: 'sankalpa-45fda',
  storageBucket: 'sankalpa-45fda.firebasestorage.app',
  messagingSenderId: '285359953972',
  appId: '1:285359953972:web:3eb866da7092e420639261',
  measurementId: 'G-19F35HFZP0',
};

export const DEFAULT_FIREBASE_CONFIG_JSON = JSON.stringify(DEFAULT_FIREBASE_CONFIG, null, 2);
