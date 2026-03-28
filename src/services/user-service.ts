import { randomUUID } from 'node:crypto';

import type { DatabaseClient } from '../db/database.js';
import { hashPassword, verifyPassword } from '../core/auth.js';
import { AppError } from '../core/errors.js';
import { nowIso } from '../core/utils.js';
import type { AuthUser, UserRole, UserVerification } from '../domain/types.js';

interface UserRecord {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

type SocialProvider = 'GOOGLE' | 'APPLE' | 'FACEBOOK';

export class UserService {
  constructor(private readonly db: DatabaseClient) {}

  async register(input: { fullName: string; email: string; password: string; role: UserRole }) {
    const existingUser = await this.findByEmail(input.email);
    if (existingUser) {
      throw new AppError('A user with this email already exists.', 409, 'EMAIL_ALREADY_USED');
    }

    const user = await this.createUserRecord(input);
    return this.getPublicUserById(user.id);
  }

  async login(email: string, password: string) {
    const user = await this.findByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    return this.toPublicUser(user);
  }

  async socialLogin(input: {
    provider: SocialProvider;
    providerUserId?: string | undefined;
    email: string;
    fullName: string;
    role: UserRole;
  }) {
    const providerEmail = input.email.toLowerCase();
    const providerUserId = input.providerUserId?.trim() || providerEmail;
    const identity = await this.db.get<{ userId: string }>(`
      SELECT user_id as "userId"
      FROM social_identities
      WHERE provider = ? AND (provider_user_id = ? OR provider_email = ?)
    `, [input.provider, providerUserId, providerEmail]);

    if (identity?.userId) {
      return this.getPublicUserById(identity.userId);
    }

    let user = await this.findByEmail(providerEmail);
    if (!user) {
      user = await this.createUserRecord({
        fullName: input.fullName,
        email: providerEmail,
        password: randomUUID(),
        role: input.role
      });
    }

    const timestamp = nowIso();
    await this.db.run(`
      INSERT INTO social_identities (id, user_id, provider, provider_user_id, provider_email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [randomUUID(), user.id, input.provider, providerUserId, providerEmail, timestamp, timestamp]);

    return this.toPublicUser(user);
  }

  async getPublicUserById(userId: string) {
    const record = await this.db.get<AuthUser>(`
      SELECT id, full_name as "fullName", email, role
      FROM users
      WHERE id = ?
    `, [userId]);

    if (!record) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    return record;
  }

  async getUserVerification(userId: string) {
    const verification = await this.db.get<UserVerification>(`
      SELECT
        user_id as "userId",
        kyc_status as "kycStatus",
        wallet_address as "walletAddress",
        payout_address as "payoutAddress",
        notes,
        reviewed_by as "reviewedBy",
        reviewed_at as "reviewedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM user_verifications
      WHERE user_id = ?
    `, [userId]);

    if (!verification) {
      throw new AppError('Verification record not found.', 404, 'VERIFICATION_NOT_FOUND');
    }

    return verification;
  }

  async listPendingVerifications() {
    return this.db.all(`
      SELECT
        u.id,
        u.full_name as "fullName",
        u.email,
        u.role,
        uv.kyc_status as "kycStatus",
        uv.wallet_address as "walletAddress",
        uv.payout_address as "payoutAddress",
        uv.notes,
        uv.created_at as "createdAt",
        uv.updated_at as "updatedAt"
      FROM user_verifications uv
      INNER JOIN users u ON u.id = uv.user_id
      WHERE uv.kyc_status = 'PENDING'
      ORDER BY uv.created_at ASC
    `);
  }

  async reviewVerification(
    actor: AuthUser,
    userId: string,
    input: {
      kycStatus: 'APPROVED' | 'REJECTED';
      walletAddress?: string | undefined;
      payoutAddress?: string | undefined;
      notes?: string | undefined;
    }
  ) {
    if (actor.role !== 'ADMIN') {
      throw new AppError('Only admins can review verification.', 403, 'ROLE_NOT_ALLOWED');
    }

    const existingUser = await this.db.get(`
      SELECT id
      FROM users
      WHERE id = ?
    `, [userId]);

    if (!existingUser) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    const timestamp = nowIso();

    await this.db.run(`
      UPDATE user_verifications
      SET
        kyc_status = ?,
        wallet_address = COALESCE(?, wallet_address),
        payout_address = COALESCE(?, payout_address),
        notes = COALESCE(?, notes),
        reviewed_by = ?,
        reviewed_at = ?,
        updated_at = ?
      WHERE user_id = ?
    `, [
      input.kycStatus,
      input.walletAddress ?? null,
      input.payoutAddress ?? null,
      input.notes ?? null,
      actor.id,
      timestamp,
      timestamp,
      userId
    ]);

    return this.getUserVerification(userId);
  }

  private async findByEmail(email: string) {
    return this.db.get<UserRecord>(`
      SELECT id, full_name as "fullName", email, password_hash as "passwordHash", role
      FROM users
      WHERE email = ?
    `, [email.toLowerCase()]);
  }

  private async createUserRecord(input: { fullName: string; email: string; password: string; role: UserRole }) {
    const userId = randomUUID();
    const timestamp = nowIso();

    await this.db.run(`
      INSERT INTO users (id, full_name, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      input.fullName,
      input.email.toLowerCase(),
      hashPassword(input.password),
      input.role,
      timestamp,
      timestamp
    ]);

    await this.db.run(`
      INSERT INTO user_verifications (
        user_id,
        kyc_status,
        wallet_address,
        payout_address,
        notes,
        reviewed_by,
        reviewed_at,
        created_at,
        updated_at
      )
      VALUES (?, 'PENDING', NULL, NULL, NULL, NULL, NULL, ?, ?)
    `, [userId, timestamp, timestamp]);

    const created = await this.findByEmail(input.email);
    if (!created) {
      throw new AppError('Unable to create user.', 500, 'USER_CREATE_FAILED');
    }

    return created;
  }

  private toPublicUser(user: UserRecord): AuthUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role
    };
  }
}
