import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertPostSchema, insertCommentSchema } from "@shared/schema";
import multer from "multer";
import path from "path";

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // User routes
  app.get('/api/users/:username', async (req, res) => {
    try {
      const user = await storage.getUserByUsername(req.params.username);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const followerCount = await storage.getFollowerCount(user.id);
      const followingCount = await storage.getFollowingCount(user.id);
      const posts = await storage.getPostsByUserId(user.id);
      
      res.json({
        ...user,
        followerCount,
        followingCount,
        postCount: posts.length,
        posts,
      });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });

  // Post routes
  app.get('/api/posts', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const posts = await storage.getPosts(limit, offset);
      
      // Get additional data for each post
      const postsWithData = await Promise.all(
        posts.map(async (post) => {
          const user = await storage.getUser(post.userId);
          const likeCount = await storage.getLikeCount(post.id);
          const comments = await storage.getCommentsByPostId(post.id);
          
          return {
            ...post,
            user,
            likeCount,
            commentCount: comments.length,
            comments: comments.slice(0, 3), // Show first 3 comments
          };
        })
      );
      
      res.json(postsWithData);
    } catch (error) {
      console.error("Error fetching posts:", error);
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  app.post('/api/posts', isAuthenticated, upload.single('image'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { caption, location } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ message: "Image is required" });
      }
      
      const imageUrl = `/uploads/${req.file.filename}`;
      
      const postData = insertPostSchema.parse({
        userId,
        caption,
        location,
        imageUrl,
      });
      
      const post = await storage.createPost(postData);
      res.json(post);
    } catch (error) {
      console.error("Error creating post:", error);
      res.status(500).json({ message: "Failed to create post" });
    }
  });

  // Like routes
  app.post('/api/posts/:id/like', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const postId = parseInt(req.params.id);
      
      const isLiked = await storage.toggleLike(userId, postId);
      const likeCount = await storage.getLikeCount(postId);
      
      res.json({ isLiked, likeCount });
    } catch (error) {
      console.error("Error toggling like:", error);
      res.status(500).json({ message: "Failed to toggle like" });
    }
  });

  // Admin routes
  const isAdmin = async (req: any, res: any, next: any) => {
    try {
      const currentUser = await storage.getUser(req.user.claims.sub);
      if (!currentUser?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      next();
    } catch (error) {
      return res.status(500).json({ message: "Failed to check admin status" });
    }
  };

  app.get('/api/admin/users', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const users = await storage.getAllUsers(limit, offset);
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post('/api/admin/verify-user', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.body;
      const updatedUser = await storage.verifyUser(userId);
      res.json({ message: "User verified successfully", user: updatedUser });
    } catch (error) {
      console.error("Error verifying user:", error);
      res.status(500).json({ message: "Failed to verify user" });
    }
  });

  // Get trending hashtags
  app.get('/api/hashtags/trending', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const hashtags = await storage.getTrendingHashtags(limit);
      res.json(hashtags);
    } catch (error) {
      console.error("Error fetching trending hashtags:", error);
      res.status(500).json({ message: "Failed to fetch trending hashtags" });
    }
  });

  // Stories routes
  app.get('/api/stories', async (req, res) => {
    try {
      const stories = await storage.getActiveStories();
      
      const storiesWithUsers = await Promise.all(
        stories.map(async (story) => {
          const user = await storage.getUser(story.userId);
          return { ...story, user };
        })
      );
      
      res.json(storiesWithUsers);
    } catch (error) {
      console.error("Error fetching stories:", error);
      res.status(500).json({ message: "Failed to fetch stories" });
    }
  });

  // Serve uploaded files
  app.use('/uploads', express.static('uploads'));

  const httpServer = createServer(app);
  return httpServer;
}
