const magic = new Uint8Array([69, 86, 70, 88, 1]);
const headerLength = magic.length + 16 + 12;
const iterations = 310000;

async function vaultKey(password, salt, usage) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', hash:'SHA-256', salt, iterations}, material,
    {name:'AES-GCM', length:256}, false, [usage]
  );
}

export async function encryptVault(data, password) {
  const header = new Uint8Array(headerLength);
  header.set(magic);
  crypto.getRandomValues(header.subarray(magic.length));
  const salt = header.subarray(magic.length, magic.length + 16);
  const iv = header.subarray(magic.length + 16);
  const key = await vaultKey(password, salt, 'encrypt');
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    {name:'AES-GCM', iv, additionalData:header, tagLength:128}, key, data
  ));
  const envelope = new Uint8Array(header.length + encrypted.length);
  envelope.set(header);
  envelope.set(encrypted, header.length);
  return envelope;
}

export async function decryptVault(data, password) {
  const bytes = new Uint8Array(data);
  if (bytes.length < headerLength + 16 || !magic.every((byte, index) => bytes[index] === byte))
    throw new Error('Invalid encrypted file');
  const header = bytes.subarray(0, headerLength);
  const salt = header.subarray(magic.length, magic.length + 16);
  const iv = header.subarray(magic.length + 16);
  const key = await vaultKey(password, salt, 'decrypt');
  return new Uint8Array(await crypto.subtle.decrypt(
    {name:'AES-GCM', iv, additionalData:header, tagLength:128}, key, bytes.subarray(headerLength)
  ));
}

if (typeof document !== 'undefined') {
  const section = document.getElementById('private');
  if (section) {
    const form = section.querySelector('form');
    const passwordInput = form.querySelector('input');
    const unlock = form.querySelector('button');
    const status = section.querySelector('[role=status]');
    const content = section.querySelector('.private-content');
    const list = section.querySelector('.private-list');
    const lock = section.querySelector('.private-lock');
    let password = '';

    const say = message => { status.textContent = message; };
    const element = (tag, className, value) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (value) node.textContent = value;
      return node;
    };

    function showEntry(entry) {
      if (!/^[a-f0-9]{32}\.bin$/.test(entry.asset) ||
          !/^[^/\\\x00-\x1f]+\.zip$/i.test(entry.filename)) throw new Error('Invalid private catalog');
      const article = element('article', 'private-item');
      article.append(element('h3', '', entry.name), element('p', 'desc', entry.description));
      article.append(element('p', 'warn', '⚠ ' + entry.warning));
      const line = element('div', 'line');
      const info = element('span', 'release-meta');
      info.append(element('span', 'meta', [entry.host, entry.version].filter(Boolean).join(' · ')));
      const uploaded = new Date(entry.uploadedAt);
      if (Number.isFinite(uploaded.getTime())) {
        const stamp = element('span', 'upload-time');
        const time = element('time', '', new Intl.DateTimeFormat(undefined, {
          day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit',
          hourCycle:'h23', timeZoneName:'short'
        }).format(uploaded));
        time.dateTime = uploaded.toISOString();
        stamp.append('Uploaded ', time);
        info.append(stamp);
      }
      const action = element('button', 'download private-download', 'Download ↓');
      action.type = 'button';
      action.addEventListener('click', async () => {
        action.disabled = true;
        say('Downloading and decrypting…');
        try {
          const response = await fetch('./vault/' + entry.asset);
          if (!response.ok) throw new Error('Download unavailable');
          const file = await decryptVault(await response.arrayBuffer(), password);
          const url = URL.createObjectURL(new Blob([file], {type:'application/zip'}));
          const link = element('a');
          link.href = url;
          link.download = entry.filename;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          say('Download ready.');
        } catch {
          say('Could not decrypt the download. Try again.');
        } finally {
          action.disabled = false;
        }
      });
      line.append(info, action);
      article.append(line);
      if (entry.install) article.append(element('p', 'private-install', entry.install));
      list.append(article);
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!globalThis.crypto?.subtle) { say('A secure connection is required.'); return; }
      unlock.disabled = true;
      say('Unlocking…');
      try {
        const response = await fetch('./private.enc', {cache:'no-store'});
        if (!response.ok) throw new Error('Private catalog unavailable');
        const candidate = passwordInput.value;
        const manifest = JSON.parse(new TextDecoder().decode(await decryptVault(await response.arrayBuffer(), candidate)));
        if (manifest.version !== 1 || !Array.isArray(manifest.entries)) throw new Error('Invalid private catalog');
        list.replaceChildren();
        manifest.entries.forEach(showEntry);
        password = candidate;
        passwordInput.value = '';
        form.hidden = true;
        content.hidden = false;
        say('');
        lock.focus();
      } catch {
        list.replaceChildren();
        say('Incorrect password or private section unavailable.');
        passwordInput.select();
      } finally {
        unlock.disabled = false;
      }
    });
    lock.addEventListener('click', () => {
      password = '';
      list.replaceChildren();
      content.hidden = true;
      form.hidden = false;
      say('');
      passwordInput.focus();
    });
  }
}
