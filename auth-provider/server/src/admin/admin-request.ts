import type { Request } from 'express';

export interface AdminActor {
  userId: string;
  sessionId: string;
  ipAddress?: string;
}

export type AdminRequest = Request & {
  adminActor?: AdminActor;
};

export function requireAdminActor(request: AdminRequest): AdminActor {
  if (!request.adminActor) {
    throw new Error('Admin guard did not attach an actor');
  }

  return request.adminActor;
}
