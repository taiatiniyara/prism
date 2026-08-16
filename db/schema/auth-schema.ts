import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  index,
  serial,
} from "drizzle-orm/pg-core";
import { organisations } from "./utility";

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
});
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

export type UserStatus = "active" | "pending" | "deactivated";
export type RegistrationClarificationDirection = "outbound" | "inbound";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  organisation_id: integer("organisation_id").references(
    () => organisations.id,
  ),
  role_id: integer("role_id").references(() => roles.id),
  status: text("status").default("pending").notNull().$type<UserStatus>(),
  date_approved: timestamp("date_approved"),
  date_rejected: timestamp("date_rejected"),
  rejected_by_user_id: text("rejected_by_user_id"),
  dataset_required: text("dataset_required"),
  data_access_reason: text("data_access_reason"),
  reject_reason: text("reject_reason"),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  // Whether the user has completed TOTP enrolment (better-auth two-factor plugin).
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
export type User = typeof user.$inferSelect & {
  role?: string | null;
  organisation?: string | null;
};
export type NewUser = typeof user.$inferInsert;

export const userStatusEvent = pgTable(
  "user_status_event",
  {
    id: serial("id").primaryKey(),
    target_user_id: text("target_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actor_user_id: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    from_status: text("from_status").notNull().$type<UserStatus>(),
    to_status: text("to_status").notNull().$type<UserStatus>(),
    decision_type: text("decision_type").notNull(),
    reason: text("reason"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("user_status_event_target_user_idx").on(table.target_user_id),
    index("user_status_event_actor_user_idx").on(table.actor_user_id),
  ],
);

export const userRegistrationClarificationMessage = pgTable(
  "user_registration_clarification_message",
  {
    id: serial("id").primaryKey(),
    target_user_id: text("target_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actor_user_id: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    direction: text("direction")
      .notNull()
      .$type<RegistrationClarificationDirection>(),
    subject: text("subject"),
    message: text("message").notNull(),
    received_from_email: text("received_from_email"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("user_reg_clarification_target_user_idx").on(table.target_user_id),
    index("user_reg_clarification_actor_user_idx").on(table.actor_user_id),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    // App-layer MFA marker (PRISM-owned, not a better-auth field): timestamp at
    // which THIS session passed the admin TOTP challenge. Null = not yet passed,
    // so the proxy will send admins to /two-factor. Reset per session (per login).
    twoFactorVerifiedAt: timestamp("two_factor_verified_at"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// TOTP secrets + backup codes for the better-auth two-factor plugin. Field
// (property) names MUST match the plugin's schema — secret, backupCodes, userId,
// verified, failedVerificationCount, lockedUntil — so the drizzleAdapter maps
// them; the DB column names are free-form. Secrets/backup codes are stored
// encrypted by the plugin and are never returned to the client.
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true).notNull(),
    failedVerificationCount: integer("failed_verification_count")
      .default(0)
      .notNull(),
    lockedUntil: timestamp("locked_until"),
  },
  (table) => [index("two_factor_user_id_idx").on(table.userId)],
);
export type TwoFactor = typeof twoFactor.$inferSelect;

// external_registrations retired 2026-07-28 (#10): legacy free-text intake path
// replaced by the pending-user flow (user.status) + the future access_request
// intake. Table dropped (0 rows, no FKs, no dependent views).

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
