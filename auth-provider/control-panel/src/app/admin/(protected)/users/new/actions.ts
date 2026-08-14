'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { buildInternalAuthServerUrl } from '@/lib/auth-server-url';

type UserField = 'name' | 'email' | 'password';

export interface CreateUserActionState {
  error: string | null;
  fieldErrors: Partial<Record<UserField, string>>;
}

function readString(formData: FormData, name: UserField): string {
  const value = formData.get(name);

  return typeof value === 'string' ? value : '';
}

function readAdminErrorCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return null;
  }

  const error = body.error;

  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  return typeof error.code === 'string' ? error.code : null;
}

export async function createUserAction(
  previousState: CreateUserActionState,
  formData: FormData,
): Promise<CreateUserActionState> {
  void previousState;

  const name = readString(formData, 'name').trim();
  const email = readString(formData, 'email').trim().toLowerCase();
  const password = readString(formData, 'password');
  const fieldErrors: CreateUserActionState['fieldErrors'] = {};

  if (name.length === 0 || name.length > 120) {
    fieldErrors.name = 'Nama wajib diisi dan maksimal 120 karakter.';
  }
  if (email.length === 0 || email.length > 320) {
    fieldErrors.email = 'Email wajib diisi dan maksimal 320 karakter.';
  }
  if (password.length < 8 || password.length > 1024) {
    fieldErrors.password = 'Password harus terdiri dari 8–1024 karakter.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: 'Periksa kembali data pengguna yang diisi.',
      fieldErrors,
    };
  }

  let response: Response;

  try {
    response = await fetch(buildInternalAuthServerUrl('/admin/users'), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        cookie: (await cookies()).toString(),
      },
      body: JSON.stringify({ name, email, password }),
      cache: 'no-store',
    });
  } catch {
    return {
      error: 'Auth Server tidak dapat dihubungi. Coba lagi setelah service aktif.',
      fieldErrors: {},
    };
  }

  if (response.status === 401) {
    redirect('/admin/login?error=session_required');
  }
  if (response.status === 403) {
    redirect('/admin/login?error=admin_required');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as unknown;
    const code = readAdminErrorCode(body);

    if (code === 'EMAIL_ALREADY_EXISTS') {
      return {
        error: 'Pengguna belum dapat dibuat.',
        fieldErrors: { email: 'Email sudah digunakan oleh pengguna lain.' },
      };
    }

    return {
      error:
        response.status === 400
          ? 'Data pengguna tidak valid. Periksa kembali seluruh field.'
          : 'Pengguna belum dapat dibuat. Silakan coba lagi.',
      fieldErrors: {},
    };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/users');
  redirect('/admin/users?created=1');
}
