/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Native filesystem asset store for Zen Board.
// Assets are saved as plain files under the user's profile directory:
//   <profile>/zen-board-assets/<uuid>.<ext>
//
// Advantages over IDB blob storage:
//   - No SHA-256 hashing in JS (no ArrayBuffer spikes)
//   - Native video streaming via file:// URLs
//   - IDB stays tiny (only scene JSON)
//   - Easy backup (just copy the folder)
//
// The board page runs as a chrome:// URL with system principal, so
// IOUtils and PathUtils are available as privileged globals.

const ASSETS_FOLDER_NAME = 'zen-board-assets';
let _assetsFolderPath = null;

async function getAssetsFolder() {
  if (_assetsFolderPath) return _assetsFolderPath;
  const folder = PathUtils.join(PathUtils.profileDir, ASSETS_FOLDER_NAME);
  await IOUtils.makeDirectory(folder, { ignoreExisting: true });
  _assetsFolderPath = folder;
  return folder;
}

// ── Path → file:// URI ────────────────────────────────────────────────────────
// PathUtils.toFileURI does NOT exist in Firefox's WebIDL. We use nsIFile +
// nsIIOService (available via Components, which is accessible in system-
// privileged chrome:// content) to get a spec-correct file:// URL.

function pathToFileURI(nativePath) {
  try {
    const nsFile = Components.classes['@mozilla.org/file/local;1']
      .createInstance(Components.interfaces.nsIFile);
    nsFile.initWithPath(nativePath);
    // Services is available in system-privileged contexts; fall back to
    // the chrome window's copy if it isn't a direct global here.
    const svc = (typeof Services !== 'undefined' ? Services
      : window.docShell?.chromeEventHandler?.ownerGlobal?.Services);
    return svc.io.newFileURI(nsFile).spec;
  } catch (e) {
    // Fallback: manual construction (works for ASCII paths and UUID filenames)
    const normalized = nativePath.replace(/\\/g, '/');
    const encoded = normalized.replace(/[^/:.~\-_!A-Za-z0-9]/g, c => encodeURIComponent(c));
    return /^[A-Za-z]:/.test(encoded) ? `file:///${encoded}` : `file://${encoded}`;
  }
}

// ── Mime-type → file extension ────────────────────────────────────────────────

function mimeToExt(mimeType) {
  const map = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4', 'video/webm': 'webm',
    'video/ogg': 'ogv', 'video/quicktime': 'mov',
  };
  return map[mimeType] || 'bin';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a Blob to disk. Returns the stable filename (UUID.ext) stored in JSON.
 * Pass existingFilename to skip the write and return the existing name.
 * @param {Blob} blob The blob to save.
 * @param {string} [existingFilename] The existing filename if any.
 */
export async function saveAsset(blob, existingFilename = null) {
  if (existingFilename) return existingFilename;

  const folder = await getAssetsFolder();
  const filename = `${crypto.randomUUID()}.${mimeToExt(blob.type)}`;
  const destPath = PathUtils.join(folder, filename);
  await IOUtils.write(destPath, new Uint8Array(await blob.arrayBuffer()));
  return filename;
}

/**
 * Build a file:// URL for a stored asset so the browser can load it directly.
 * Returns null if the file doesn't exist.
 * @param {string} filename The filename of the asset.
 */
export async function getAssetURL(filename) {
  const folder = await getAssetsFolder();
  const filePath = PathUtils.join(folder, filename);
  return pathToFileURI(filePath);
}

/**
 * Delete a stored asset file.
 * @param {string} filename The filename of the asset.
 */
export async function deleteAsset(filename) {
  try {
    const folder = await getAssetsFolder();
    await IOUtils.remove(PathUtils.join(folder, filename), { ignoreAbsent: true });
  } catch (e) {
    console.warn('ZenBoard: Could not delete asset', filename, e);
  }
}

/**
 * Check whether an asset file exists on disk.
 * @param {string} filename The filename of the asset.
 */
export async function assetExists(filename) {
  try {
    const folder = await getAssetsFolder();
    return await IOUtils.exists(PathUtils.join(folder, filename));
  } catch {
    return false;
  }
}
