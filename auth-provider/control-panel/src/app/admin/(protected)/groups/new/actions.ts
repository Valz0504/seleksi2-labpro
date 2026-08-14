'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { fetchAdminApi, readAdminErrorCode } from '@/lib/admin-api';

type GroupField = 'name' | 'description';

export interface CreateGroupActionState {
  error: string | null;
  fieldErrors: Partial<Record<GroupField, string>>;
}

function readString(formData: FormData, name: GroupField): string {
  const value = formData.get(name);

  return typeof value === 'string' ? value : '';
}

export async function createGroupAction(
  previousState: CreateGroupActionState,
  formData: FormData,
): Promise<CreateGroupActionState> {
  void previousState;

  const name = readString(formData, 'name').trim();
  const description = readString(formData, 'description').trim();
  const fieldErrors: CreateGroupActionState['fieldErrors'] = {};

  if (name.length === 0 || name.length > 120) {
    fieldErrors.name = 'Nama group wajib diisi dan maksimal 120 karakter.';
  }
  if (description.length > 1000) {
    fieldErrors.description = 'Deskripsi maksimal 1000 karakter.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: 'Periksa kembali data group yang diisi.',
      fieldErrors,
    };
  }

  let response: Response;

  try {
    response = await fetchAdminApi('/admin/groups', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, ...(description ? { description } : {}) }),
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

    if (code === 'GROUP_NAME_ALREADY_EXISTS') {
      return {
        error: 'Group belum dapat dibuat.',
        fieldErrors: { name: 'Nama group sudah digunakan.' },
      };
    }

    return {
      error:
        response.status === 400
          ? 'Data group tidak valid. Periksa kembali seluruh field.'
          : 'Group belum dapat dibuat. Silakan coba lagi.',
      fieldErrors: {},
    };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/groups');
  redirect('/admin/groups?created=1');
}
