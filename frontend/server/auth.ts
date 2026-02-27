import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin, supabaseAuth } from "./supabase";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return res.status(401).json({ error: "Missing Authorization token" });
    }

    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const user = data.user;

    let profile = null;
    const { data: profileData } = await supabaseAdmin
      .from("profiles")
      .select("id, role, display_name")
      .eq("id", user.id)
      .maybeSingle();

    if (!profileData) {
      const { data: createdProfile } = await supabaseAdmin
        .from("profiles")
        .insert([
          {
            id: user.id,
            role: "client",
            display_name: user.email || "User",
          },
        ])
        .select("id, role, display_name")
        .single();
      profile = createdProfile;
    } else {
      profile = profileData;
    }

    const { data: assignments } = await supabaseAdmin
      .from("client_users")
      .select("client_id")
      .eq("user_id", user.id);

    const clientIds = (assignments || []).map((a) => a.client_id).filter(Boolean);

    req.auth = {
      user: {
        id: user.id,
        email: user.email,
      },
      profile,
      clientIds,
      token,
    };

    next();
  } catch (err: any) {
    console.error("Auth error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.profile?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  return next();
}
