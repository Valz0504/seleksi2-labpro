'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { fetchAdminApi, readAdminErrorCode } from '@/lib/admin-api';
import { getCurrentAdminSession } from '@/lib/admin-session';

type GroupField = 'name' | 'description';

export interface UpdateGroupActionState {
  error: string | null;
  fieldErrors: Partial<Record<GroupField, string>>;
}

export interface DeleteGroupActionState {
  error: string | null;
}

function readString(formData: FormData, name: GroupField): string {
  const value = formData.get(name);

  return typeof value === 'string' ? value : '';
}

export async function updateGroupAction(
  groupId: string,
  previousState: UpdateGroupActionState,
  formData: FormData,
): Promise<UpdateGroupActionState> {
  void previousState;

  const name = readString(formData, 'name').trim();
  const description = readString(formData, 'description').trim();
  const fieldErrors: UpdateGroupActionState['fieldErrors'] = {};

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
    response = await fetchAdminApi(`/admin/groups/${encodeURIComponent(groupId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, description: description || null }),
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
        error: 'Group belum dapat diperbarui.',
        fieldErrors: { name: 'Nama group sudah digunakan.' },
      };
    }
    if (code === 'GROUP_NOT_FOUND') {
      return {
        error: 'Group tidak lagi ditemukan. Kembali ke daftar group.',
        fieldErrors: {},
      };
    }

    return {
      error:
        response.status === 400
          ? 'Data group tidak valid. Periksa kembali seluruh field.'
          : 'Group belum dapat diperbarui. Silakan coba lagi.',
      fieldErrors: {},
    };
  }

  revalidatePath('/admin/groups');
  revalidatePath(`/admin/groups/${groupId}`);
  redirect(`/admin/groups/${encodeURIComponent(groupId)}?updated=1`);
}

export async function deleteGroupAction(
  groupId: string,
  previousState: DeleteGroupActionState,
  formData: FormData,
): Promise<DeleteGroupActionState> {
  void previousState;
  void formData;

  if (!(await getCurrentAdminSession())) {
    redirect('/admin/login?error=session_required');
  }

  let response: Response;

  try {
    response = await fetchAdminApi(`/admin/groups/${encodeURIComponent(groupId)}`, {
      method: 'DELETE',
    });
  } catch {
    return { error: 'Auth Server tidak dapat dihubungi. Coba lagi setelah service aktif.' };
  }

  if (response.status === 401) {
    redirect('/admin/login?error=session_required');
  }
  if (response.status === 403) {
    redirect('/admin/login?error=admin_required');
  }

  if (!response.ok) {
    return {
      error:
        (await readAdminErrorCode(response)) === 'GROUP_NOT_FOUND'
          ? 'Group tidak lagi ditemukan.'
          : 'Group belum dapat dihapus. Silakan coba lagi.',
    };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/groups');
  revalidatePath('/admin/users');
  revalidatePath('/admin/applications');

  if (!(await getCurrentAdminSession())) {
    redirect('/admin/login?notice=group_deleted');
  }

  redirect('/admin/groups?deleted=1');
}
