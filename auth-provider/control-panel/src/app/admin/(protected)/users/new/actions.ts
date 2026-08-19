'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { fetchAdminApi, readAdminErrorCode } from '@/lib/admin-api';

type UserField = 'name' | 'email' | 'password';

export interface CreateUserActionState {
  error: string | null;
  fieldErrors: Partial<Record<UserField, string>>;
}

function readString(formData: FormData, name: UserField): string {
  const value = formData.get(name);

  return typeof value === 'string' ? value : '';
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
    response = await fetchAdminApi('/admin/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name, email, password }),
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
    const code = await readAdminErrorCode(response);

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
