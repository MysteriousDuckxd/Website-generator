'use strict';
const fs = require('fs');
const path = require('path');

/** Tiny JSON-file database. Fine for hundreds/thousands of leads on one machine. */
class Store {
  constructor(file) {
    this.file = file;
    this.data = { businesses: [], calls: [], dnc: [] };
    if (fs.existsSync(file)) {
      this.data = { ...this.data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  get businesses() { return this.data.businesses; }
  get calls() { return this.data.calls; }
  get dnc() { return this.data.dnc; }

  findBusiness(id) { return this.data.businesses.find((b) => b.id === id); }
  findCall(id) { return this.data.calls.find((c) => c.id === id); }
  callsFor(businessId) { return this.data.calls.filter((c) => c.businessId === businessId); }
  isOnDnc(phone) { return this.data.dnc.some((d) => d.phone === phone); }

  addDnc(phone, reason = 'manual') {
    if (!phone || this.isOnDnc(phone)) return false;
    this.data.dnc.push({ phone, reason, addedAt: new Date().toISOString() });
    this.save();
    return true;
  }

  removeDnc(phone) {
    const before = this.data.dnc.length;
    this.data.dnc = this.data.dnc.filter((d) => d.phone !== phone);
    if (this.data.dnc.length !== before) this.save();
  }
}

module.exports = Store;
