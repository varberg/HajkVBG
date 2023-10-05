import { execSync } from "child_process";
import log4js from "log4js";

const logger = log4js.getLogger("psad.service.v2");

// AD Lookup using powershell commands.
//
// AD_POWERSHELL_LOOKUP=true
// AD_POWERSHELL_LOOKUP_TEST_USER=username # A user that has a minimum of one group.
// AD_POWERSHELL_CACHE_TIMEOUT=3600 # Timeout in seconds
// curl --header "X-Control-Header: username" -v http://localhost:3002/api/v2/config/xxxxxxxx

class PSAD {
  constructor() {
    this.clearCache();
    this._trustedHeader = process.env.AD_TRUSTED_HEADER || "X-Control-Header";
    this._cacheTimeout = process.env.AD_POWERSHELL_CACHE_TIMEOUT || 7200; // defaults to 2 hours.
    this._allowedProps = [
      "cn",
      "sn",
      "title",
      "physicalDeliveryOfficeName",
      "telephoneNumber",
      "givenName",
      "distinguishedName",
      "displayName",
      "department",
      "company",
      "employeeType",
      "name",
      "userAccountControl",
      "employeeID",
      "sAMAccountName",
      "sAMAccountType",
      "userPrincipalName",
      "mail",
      "mobile",
      "mailNickname",
    ];
  }

  clearCache() {
    this._users = {};
    this._groups = {
      updateTime: null,
      list: [],
    };
  }

  runCommand(cmd) {
    // force powershell to UTF8
    cmd =
      "$OutputEncoding = [System.Console]::OutputEncoding = [System.Console]::InputEncoding = [System.Text.Encoding]::UTF8;\n" +
      cmd;
    let res = execSync(cmd, {
      shell: "powershell.exe",
      encoding: "utf8",
    }).toString();
    return { error: null, success: true, value: res };
  } catch (error) {
    return { error: error, success: false, value: null };
  }
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
    if (!this.validUserName(userName)) {
      return null;
    }

    if (this._users[userName] && this._users[userName].exists === true) {
      if (
        (new Date().getTime() - this._users[userName].updateTime) / 1000 <=
        this._cacheTimeout
      ) {
        // Get cached User data
        return this._users[userName];
      }
    }

    const res = this.runCommand(
      `$a = (New-Object System.DirectoryServices.DirectorySearcher("(&(objectCategory=User)(samAccountName=${userName}))")).FindOne(); $a.GetDirectoryEntry().Properties;`
    );

    let props = {};
    let currentPropName = "";

    if (!res.value) {
      this._users[userName] = {
        props: null,
        groups: null,
        exists: false,
        updateTime: new Date().getTime(),
      };
      return null;
    }

    res.value
      .split("\r\n")
      .filter((s) => {
        return s.trim() !== "" && s.indexOf(":") > 0;
      })
      .forEach((line) => {
        const keyValue = line.trim().split(":");
        if (keyValue && keyValue.length === 2) {
          const key = keyValue[0].trim();
          const value = keyValue[1].trim();
          if (key === "PropertyName") {
            currentPropName = value;
          } else if (
            key === "Value" &&
            this._allowedProps.indexOf(currentPropName) > -1
          ) {
            props[currentPropName] = value;
          }
        }
      });

    props.employeeID = ("" + props.employeeID).substring(0, 8) + "xxxx"; // yes... strip last 4 digits. It's not welcome in log.

    this._users[userName] = {
      exists: true,
      props: props,
      updateTime: new Date().getTime(),
    };

    logger.debug(
      `User ${userName}'s props (some of them):`,
      this._users[userName].props
    );

    return this._users[userName];
  }

  userExists(userName) {
    return this.getUser(userName).exists === true;
  }

  getAllGroups() {
    if (this._groups.list.length > 0) {
      if (
        (new Date().getTime() - this._groups.updateTime) / 1000 <=
        this._cacheTimeout
      ) {
        // Get cached Groups
        return this._groups.list;
      }
    }

    const cmd = `$b = New-Object system.DirectoryServices.DirectorySearcher;
    $b.filter = "(objectclass=group)";
    $b.PageSize = 5000
    $b.PropertiesToLoad.Clear();
    $b.PropertiesToLoad.Add("distinguishedname");
    $b.FindAll();`;

    const res = this.runCommand(cmd);

    if (!res.value) {
      this._groups.list = [];
      this._groups.updateTime = new Date().getTime();
      return this._groups.list;
    }

    const regex = /:\/\/CN=([A-Za-z_0-9 ]*)/gm;
    let groups = [];
    let regexResult;

    while ((regexResult = regex.exec(res.value))) {
      groups.push(regexResult[1]);
    }

    this._groups.list = groups;
    this._groups.updateTime = new Date().getTime();

    return this._groups.list;
  }

  getUserGroups(userName) {
    const user = this.getUser(userName);

    if (!user || (user && user.exists === false)) {
      return [];
    }

    if (user.groups) {
      return user.groups;
    }

    const res = this.runCommand(
      `$c = (New-Object System.DirectoryServices.DirectorySearcher("(&(objectCategory=User)(samAccountName=${userName}))")).FindOne(); $c.GetDirectoryEntry().memberOf`
    );

    if (!res.value) {
      return [];
    }

    const regex = /CN=([A-Za-z_0-9 ]*)/gm;
    let groups = [];
    let regexResult;

    while ((regexResult = regex.exec(res.value))) {
      groups.push(regexResult[1]);
    }

    logger.debug(`User ${userName} is member of these groups:`, groups);

    this._users[userName].groups = groups;

    return groups;
  }

  getUserIsMemberOfGroup(userName, group) {
    if (this.userExists(userName)) {
      const groups = this.getUserGroups(userName);
      return groups.includes(group);
    }
    return false;
  }
}

export default new PSAD();
