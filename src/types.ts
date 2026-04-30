export interface LocationData {
  id: string;
  title: string;
  description?: string;
  lat: number;
  lng: number;
  realPhotoUrl: string;
  refPhotoUrl?: string;
  showRefOnMap?: boolean;
  copyright: string;
  createdAt: number;
  authorUid: string;
  visited?: boolean;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
