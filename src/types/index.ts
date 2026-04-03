rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(uid) {
      return isAuthenticated() && request.auth.uid == uid;
    }

    function isAllowedVerificationImage() {
      return request.resource != null
        && request.resource.size <= 5 * 1024 * 1024
        && request.resource.contentType in ['image/jpeg', 'image/png'];
    }

    // Profile photos
    match /user_photos/{uid}/{fileName} {
      allow read: if isAuthenticated();
      allow write: if isOwner(uid);
    }

    // CV documents
    match /cvs/{uid}/{fileName} {
      allow read: if isOwner(uid);
      allow write: if isOwner(uid);
    }

    // Verification documents (ID front + selfie)
    match /verification_docs/{uid}/{fileName} {
      allow read: if isOwner(uid);
      allow write: if isOwner(uid) && isAllowedVerificationImage();
    }

    // Chat attachments
    match /message-attachments/{uid}/{conversationId}/{fileName} {
      allow read: if isAuthenticated();
      allow write: if isOwner(uid);
    }

    // Deny everything else
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
