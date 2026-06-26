import { apiClient } from './api-client';

/** Current user's own profile (photo, basic fields). */
export const profileApi = {
  /**
   * Upload / replace the profile photo. `blob` is the cropped square exported by
   * the cropper (PNG or JPG). Returns the new Cloudinary URL.
   */
  uploadPicture: async (blob: Blob, filename = 'avatar.jpg'): Promise<string> => {
    const fd = new FormData();
    fd.append('image', blob, filename);
    const r = await apiClient.post<{ data: { profilePictureUrl: string } }>('/profile/picture', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return r.data.profilePictureUrl;
  },
};
