import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  mustChangePassword: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}