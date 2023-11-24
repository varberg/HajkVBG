// import { execSync } from "child_process";
import log4js from "log4js";

const logger = log4js.getLogger("adgroupheader.service");

// AD Lookup using powershell commands.
//
// AD_POWERSHELL_LOOKUP=true
// AD_POWERSHELL_LOOKUP_TEST_USER=username # A user that has a minimum of one group.
// AD_POWERSHELL_CACHE_TIMEOUT=3600 # Timeout in seconds
// curl --header "X-Control-Header: username" -v http://localhost:3002/api/v2/config/xxxxxxxx

class AdGroupHeaderService {
  constructor() {
    // this._trustedUserHeader =
    //   process.env.AD_TRUSTED_HEADER || "X-Control-Header";
    // this._trustedGroupHeader =
    //   process.env.AD_TRUSTED_HEADER || "X-Control-Group-Header";
    this.users = {};
  }

  validUserName(userName) {
    // Crucial to check that input is safe. Keep chars to bare minimum.
    const regex = /^[A-Za-z0-9-_]+/;
    const res = regex.exec(userName);

    if (res) {
      // Is input safe? Is the userName valid?
      return res[0] === userName && userName.trim() != "";
    }

    return false;
  }

  getUser(userName) {
    return userName && userName.trim().length > 0;
  }

  userExists(userName) {
    return this.getUser(userName) ? true : false;
  }

  getUserGroups(userName) {
    if (!this.getUser(userName)) {
      return [];
    }

    return this.users[userName];
  }

  setUserGroups(userName, groups) {
    if (!this.getUser(userName)) {
      return;
    }
    this.users[userName] = groups;
  }

  getUserIsMemberOfGroup(userName, group) {
    if (this.userExists(userName)) {
      const groups = this.getUserGroups(userName);
      return groups.includes(group);
    }
    return false;
  }
}

export default new AdGroupHeaderService();
