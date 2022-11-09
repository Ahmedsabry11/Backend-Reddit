//const User = require('../models/userModel');
//const Repository = require('../data_access/repository');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { promisify } = require("util");

class UserService {
  constructor(User, UserRepository, emailServices) {
    this.User = User; // can be mocked in unit testing
    this.userRepository = UserRepository; // can be mocked in unit testing
    this.emailServices = emailServices;
    this.createUser = this.createUser.bind(this);
    this.createToken = this.createToken.bind(this);
    this.signUp = this.signUp.bind(this);
    this.logIn = this.logIn.bind(this);
    this.forgotPassword = this.forgotPassword.bind(this);
    this.forgotUserName = this.forgotUserName.bind(this);
    this.resetPassword = this.resetPassword.bind(this);
    this.getUser = this.getUser.bind(this);
    this.getUserByEmail = this.getUserByEmail.bind(this);
    this.getUserByName = this.getUserByName.bind(this);
    this.decodeToken = this.decodeToken.bind(this);
    this.getPrefs = this.getPrefs.bind(this);
    this.updatePrefs = this.updatePrefs.bind(this);
    this.filterObj = this.filterObj.bind(this);

    this.isAvailable = this.isAvailable.bind(this);
    this.subscribe = this.subscribe.bind(this);
  }
  async createUser(data) {
    try {
      let user = await this.userRepository.createOne(data);
      return user;
    } catch (err) {
      console.log("catch error here" + err);
      const error = {
        status: "fail",
        statusCode: 400,
        err,
      };
      return error;
    }
  }
  createToken(id) {
    // what to put in token ?
    const token = jwt.sign({ id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });
    return token;
  }
  async signUp(email, userName, password) {
    const userData = {
      email: email,
      userName: userName,
      password: password,
    };
    let user = await this.userRepository.createOne(userData);
    if (user.status === "fail") {
      // user with this email or username is exists
      const response = {
        status: 400,
        body: {
          status: "fail",
          errorMessage: "User already Exists",
        },
      };
      return response;
    } else {
      const token = this.createToken(user.doc._id);
      const response = {
        status: 201,
        body: {
          status: "success",
          token: token,
        },
      };
      return response;
    }
  }
  async logIn(userName, password) {
    let user = await this.userRepository.getOne(
      { userName: userName },
      "+password",
      ""
    );
    if (user.status === "fail") {
      const response = {
        status: 400,
        body: {
          status: "fail",
          errorMessage: "Invalid username or password",
        },
      };
      return response;
    } else {
      if (await user.doc.checkPassword(password, user.doc.password)) {
        const token = this.createToken(user.doc._id);
        const response = {
          status: 200,
          body: {
            status: "success",
            token: token,
          },
        };
        return response;
      } else {
        const response = {
          status: 400,
          body: {
            status: "fail",
            errorMessage: "Invalid username or password",
          },
        };
        return response;
      }
    }
  }
  async forgotUserName(email) {
    try {
      let user = await this.userRepository.getOne({ email: email }, "", "");
      if (user.statusCode === 200) {
        await this.emailServices.sendUserName(user.doc);
        const response = {
          status: 204,
          body: {
            status: "success",
          },
        };
        return response;
      } else {
        const response = {
          status: 404,
          body: {
            status: "fail",
            errorMessage: "User Not Found",
          },
        };
        return response;
      }
    } catch (err) {
      console.log("catch error : " + err);
      const error = {
        status: 400,
        body: {
          errorMessage: err,
        },
      };
      return error;
    }
  }
  async forgotPassword(userName, email) {
    try {
      const query = {
        userName: userName,
        email: email,
      };
      let user = await this.userRepository.getOne(query, "");

      if (user.statusCode === 200) {
        const resetToken = user.doc.createPasswordResetToken();
        await user.doc.save({ validateBeforeSave: false });
        const resetURL = `${process.env.FRONTDOMAIN}resetPassword/${resetToken}`;
        await this.emailServices.sendPasswordReset(user.doc, resetURL);
        const response = {
          status: 204,
          body: {
            status: "success",
          },
        };
        return response;
      } else {
        const response = {
          status: 404,
          body: {
            status: "fail",
            errorMessage: "User Not Found",
          },
        };
        return response;
      }
    } catch (err) {
      console.log("catch error:" + err);
      const error = {
        status: 400,
        body: {
          status: "fail",
          errorMessage: err,
        },
      };
      return error;
    }
  }
  async resetPassword(resetToken, password) {
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    let user = await this.userRepository.getOne(
      {
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() },
      },
      "",
      ""
    );
    if (user.status === "fail") {
      // invalid token or time passed
      const response = {
        status: 400,
        body: {
          status: "fail",
          errorMessage: "token is invalid or has expired ",
        },
      };
      return response;
    } else {
      user.doc.password = password;
      user.doc.passwordResetToken = undefined;
      user.doc.passwordResetExpires = undefined;
      await user.doc.save();
      const token = this.createToken(user.doc._id);
      const response = {
        status: 200,
        body: {
          token: token,
        },
      };
      return response;
    }
  }
  async decodeToken(token) {
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    return decoded;
  }
  // should be generic
  async getUser(id) {
    let user = await this.userRepository.getOne({ _id: id }, "", "");
    return user;
  }
  async getUserByEmail(email) {
    let user = await this.userRepository.getOne({ email: email }, "", "");
    return user;
  }
  async getUserByName(userName, popOptions) {
    let user = await this.userRepository.getOne(
      { userName: userName },
      "",
      popOptions
    );
    return user;
  }
  getPrefs(user) {
    let prefs = {
      contentvisibility: user.contentvisibility,
      canbeFollowed: user.canbeFollowed,
      nsfw: user.nsfw,
      allowInboxMessage: user.allowInboxMessage,
      allowMentions: user.allowMentions,
      allowCommentsOnPosts: user.allowCommentsOnPosts,
      allowUpvotesOnComments: user.allowUpvotesOnComments,
      allowUpvotesOnPosts: user.allowUpvotesOnPosts,
      displayName: user.displayName,
      profilePicture: user.profilePicture,
    };
    return prefs;
  }
  async updatePrefs(query, id) {
    console.log(query);
    const filteredBody = this.filterObj(
      query,
      "contentvisibility",
      "canbeFollowed",
      "nsfw",
      "allowInboxMessage",
      "allowMentions",
      "allowCommentsOnPosts",
      "allowUpvotesOnComments",
      "allowUpvotesOnPosts",
      "displayName",
      "profilePicture"
    );
    console.log("a   ", filteredBody);
    let user = await this.userRepository.updateOne({ _id: id }, filteredBody);
    return this.getPrefs(user.doc);
  }
  filterObj(obj, ...allowedFields) {
    const newObj = {};
    Object.keys(obj).forEach((el) => {
      if (allowedFields.includes(el)) newObj[el] = obj[el];
    });
    return newObj;
  }

  async isAvailable(username) {
    const found = await this.userRepository.getByQuery(
      { userName: username },
      "_id"
    );
    return !found;
  }

  async subscribe(userId, subredditId, action) {
    const alreadySubscribed = await this.userRepository.getByQuery(
      { _id: userId, subscribed: subredditId },
      "_id"
    );
    console.log(alreadySubscribed);
    //In order to subscribe, user should not be already subscribed
    if (action==="sub" && !alreadySubscribed) {
      return await this.userRepository.push(userId, {
        subscribed: subredditId,
      });
    //In order to unsubscribe, user should be already subscribed
    } else if (action==="unsub" && alreadySubscribed) {
      return await this.userRepository.pull(userId, {
        subscribed: subredditId,
      });
    }
    return false;
  }
}
//export default UserService;
module.exports = UserService;
