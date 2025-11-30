// public/uploader.js

async function generateFromImages(authToken, chosenFiles, extraSettings) {
  const formData = new FormData();
  chosenFiles.forEach(f => formData.append('files', f));

  // চাইলে length / profile ইত্যাদি পাঠাতে পারো:
  if (extraSettings) {
    Object.entries(extraSettings).forEach(([key, value]) => {
      formData.append(key, value);
    });
  }

  const res = await fetch('/api/generate-from-images', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + authToken,
      // NOTE: এখানে Content-Type set করবে না, ব্রাউজার নিজে boundary সেট করবে
    },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Generation failed');
  }

  return data;
}
