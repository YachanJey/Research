/**
 * Deletes a user from the database based on the provided user ID.
 *
 * @async
 * @function deleteUser
 * @param {Object} req - The request object.
 * @param {Object} req.params - The request parameters.
 * @param {string} req.params.userId - The ID of the user to be deleted.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} Sends a JSON response indicating the success or failure of the operation.
 *
 * @throws {Error} Returns a 400 status if the user ID is invalid.
 * @throws {Error} Returns a 404 status if the user is not found.
 * @throws {Error} Returns a 500 status if there is an internal server error.
 */
const User = require("../Models/user.model");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { sendVerificationEmail } = require("../Utils/email");

exports.signup = async (req, res) => {
  console.log(`signup request: ${req}`)
  const {
    username,
    email,
    password,
    first_name,
    last_name,
    phone_number,
    date_of_birth,
    address,
    street1,
    street2,
    city,
    province,
    district,
    country,
    latitude = null,
    longitude = null,

  } = req.body;

  try {
    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: "User already exists" });
    }

    // Create new user
    user = new User({
      username,
      email,
      password,
      first_name,
      last_name,
      phone_number,
      date_of_birth,
      address,
      street1,
      street2,
      city,
      province,
      district,
      country,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,

    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Save user to database
    await user.save();

    // Create and return JWT token
    const payload = { id: user.id };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
};


exports.signin = async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if user exists
    let user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ msg: "Invalid Credentials" });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid Credentials" });
    }

    // Create JWT token (without role)
    const payload = { id: user.id };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
      (err, token) => {
        if (err) throw err;
        res.json({ token, role: user.role });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
};


exports.sendPasswordResetOTP = async (req, res) => {
  const { email } = req.body;

  try {
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: "User does not exist" });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000); 

    // Save OTP to database
    user.resetPasswordOTP = otp;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour validity
    await user.save();

    // Send OTP via email
    const emailSent = await sendVerificationEmail(user.email, otp);

    if (!emailSent) {
      return res.status(500).json({ msg: "Failed to send OTP email" });
    }

    res.json({ msg: "OTP sent to email successfully" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
};

exports.resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    // Check if user exists
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: "User does not exist" });
    }

    // Ensure OTP is valid and not expired
    if (
      !user.resetPasswordOTP ||
      !user.resetPasswordExpires ||
      user.resetPasswordExpires < Date.now()
    ) {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    if (user.resetPasswordOTP.toString() !== otp.toString()) {
      return res.status(400).json({ msg: "Incorrect OTP" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    // Clear OTP and expiration
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;

    // Save updated user data
    await user.save();

    res.json({ msg: "Password reset successful" });
  } catch (err) {
    console.error("Error resetting password:", err.message);
    res.status(500).send("Server error");
  }
};

exports.getUserDetails = async (req, res) => {
  const userId = req.user.id;

  try {
    let user = await User.findById(userId).select(
      "-password -resetPasswordOTP -resetPasswordExpires"
    );
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.json(user);
  } catch (err) {
    console.error("Error fetching user details:", err.message);
    res.status(500).send("Server error");
  }
};

exports.updateUserDetails = async (req, res) => {
  const { first_name, last_name, phone_number, date_of_birth, address } =
    req.body;
  const userId = req.user.id;

  try {
    let user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // Update user details
    user.first_name = first_name || user.first_name;
    user.last_name = last_name || user.last_name;
    user.phone_number = phone_number || user.phone_number;
    user.date_of_birth = date_of_birth || user.date_of_birth;
    user.address = address || user.address;

    await user.save();

    res.json({ msg: "User details updated successfully", user });
  } catch (err) {
    console.error("Error updating user details:", err.message);
    res.status(500).send("Server error");
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    let users = await User.find().select("-password -resetPasswordOTP -resetPasswordExpires");
    res.json(users);
  } catch (err) {
    console.error("Error fetching all users:", err.message);
    res.status(500).send("Server error");
  }
};

exports.updateUserRole = async (req, res) => {
  const { userId, role } = req.body;

  try {
    let user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    user.role = role;

    await user.save();

    res.json({ msg: "User role updated successfully", user });
  } catch (err) {
    console.error("Error updating user role:", err.message);
    res.status(500).send("Server error");
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log("Received request to delete user with ID:", userId);

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "User deleted successfully" });

  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};
