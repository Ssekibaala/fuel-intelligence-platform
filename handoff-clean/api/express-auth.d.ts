import "express";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: {
          id: string;
          email?: string | null;
        };
        profile?: {
          id?: string;
          role?: string;
          display_name?: string | null;
        } | null;
        clientIds: string[];
        token: string;
      };
    }
  }
}

export {};
