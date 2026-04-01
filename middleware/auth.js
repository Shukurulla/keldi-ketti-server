const jwt = require("jsonwebtoken");

const authMiddleware = (roles = []) => {
  return (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "Токен табылмады" });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;

      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: "Рұқсат жоқ" });
      }

      next();
    } catch (error) {
      return res.status(401).json({ message: "Жарамсыз токен" });
    }
  };
};

module.exports = authMiddleware;
