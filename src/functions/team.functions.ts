// Server functions for team management (admin-only user creation).
// These run on the server only — the service-role client is never sent to the browser.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createUserSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().trim().optional(),
});

export const createUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => createUserSchema.parse(data))
  .handler(async ({ data, context }) => {
    // client.server.ts is a *.server.ts module, safe to import lazily inside a handler.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Re-verify the caller is an admin server-side. Do not trust anything from the client.
    const { data: callerRoles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");

    if (roleError) {
      throw new Error("Could not verify permissions");
    }
    if (!callerRoles || callerRoles.length === 0) {
      throw new Error("Forbidden: admin role required");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: data.fullName ? { full_name: data.fullName } : undefined,
    });

    if (error) {
      throw new Error(error.message);
    }

    // Note: the `on_auth_user_created` trigger (handle_new_user) fires automatically
    // on this insert into auth.users — it creates the profiles row and the default
    // 'consultant' user_roles row, so nothing else needs to happen here.

    return { userId: created.user?.id, email: created.user?.email };
  });
