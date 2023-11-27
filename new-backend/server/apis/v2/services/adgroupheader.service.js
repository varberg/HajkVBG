class AdGroupHeaderService {
  constructor() {
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
