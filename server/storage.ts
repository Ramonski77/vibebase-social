import {
  users,
  posts,
  likes,
  comments,
  follows,
  stories,
  type User,
  type UpsertUser,
  type Post,
  type InsertPost,
  type Comment,
  type InsertComment,
  type Like,
  type InsertLike,
  type Follow,
  type InsertFollow,
  type Story,
  type InsertStory,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, lt } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getUserByUsername(username: string): Promise<User | undefined>;
  updateUserProfile(id: string, data: Partial<User>): Promise<User>;
  
  // Post operations
  createPost(post: InsertPost): Promise<Post>;
  getPost(id: number): Promise<Post | undefined>;
  getPosts(limit?: number, offset?: number): Promise<Post[]>;
  getPostsByUserId(userId: string): Promise<Post[]>;
  deletePost(id: number, userId: string): Promise<void>;
  
  // Like operations
  toggleLike(userId: string, postId: number): Promise<boolean>;
  getLikeCount(postId: number): Promise<number>;
  isPostLiked(userId: string, postId: number): Promise<boolean>;
  
  // Comment operations
  createComment(comment: InsertComment): Promise<Comment>;
  getCommentsByPostId(postId: number): Promise<Comment[]>;
  deleteComment(id: number, userId: string): Promise<void>;
  
  // Follow operations
  toggleFollow(followerId: string, followingId: string): Promise<boolean>;
  getFollowerCount(userId: string): Promise<number>;
  getFollowingCount(userId: string): Promise<number>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
  getSuggestedUsers(userId: string, limit?: number): Promise<User[]>;
  
  // Story operations
  createStory(story: InsertStory): Promise<Story>;
  getActiveStories(): Promise<Story[]>;
  deleteExpiredStories(): Promise<void>;
  
  // Admin operations
  getAllUsers(limit?: number, offset?: number): Promise<User[]>;
  banUser(userId: string, reason: string): Promise<User>;
  unbanUser(userId: string): Promise<User>;
  verifyUser(userId: string): Promise<User>;
  unverifyUser(userId: string): Promise<User>;
  makeAdmin(userId: string): Promise<User>;
  removeAdmin(userId: string): Promise<User>;
  deletePostAsAdmin(id: number): Promise<void>;
  
  // Hashtag operations
  getTrendingHashtags(limit?: number): Promise<Array<{ tag: string; posts: number }>>;
  getHashtagCount(hashtag: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async updateUserProfile(id: string, data: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Post operations
  async createPost(post: InsertPost): Promise<Post> {
    const [newPost] = await db.insert(posts).values(post).returning();
    return newPost;
  }

  async getPost(id: number): Promise<Post | undefined> {
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    return post;
  }

  async getPosts(limit: number = 20, offset: number = 0): Promise<Post[]> {
    return await db
      .select()
      .from(posts)
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getPostsByUserId(userId: string): Promise<Post[]> {
    return await db
      .select()
      .from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt));
  }

  async deletePost(id: number, userId: string): Promise<void> {
    // First delete all related data
    await db.delete(likes).where(eq(likes.postId, id));
    await db.delete(comments).where(eq(comments.postId, id));
    
    // Then delete the post
    await db.delete(posts).where(and(eq(posts.id, id), eq(posts.userId, userId)));
  }

  async deletePostAsAdmin(id: number): Promise<void> {
    // First delete all related data
    await db.delete(likes).where(eq(likes.postId, id));
    await db.delete(comments).where(eq(comments.postId, id));
    
    // Then delete the post (admin can delete any post)
    await db.delete(posts).where(eq(posts.id, id));
  }

  // Like operations
  async toggleLike(userId: string, postId: number): Promise<boolean> {
    const existingLike = await db
      .select()
      .from(likes)
      .where(and(eq(likes.userId, userId), eq(likes.postId, postId)))
      .limit(1);

    if (existingLike.length > 0) {
      await db.delete(likes).where(and(eq(likes.userId, userId), eq(likes.postId, postId)));
      return false;
    } else {
      await db.insert(likes).values({ userId, postId });
      return true;
    }
  }

  async getLikeCount(postId: number): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(likes)
      .where(eq(likes.postId, postId));
    return result.count;
  }

  async isPostLiked(userId: string, postId: number): Promise<boolean> {
    const [like] = await db
      .select()
      .from(likes)
      .where(and(eq(likes.userId, userId), eq(likes.postId, postId)))
      .limit(1);
    return !!like;
  }

  // Comment operations
  async createComment(comment: InsertComment): Promise<Comment> {
    const [newComment] = await db.insert(comments).values(comment).returning();
    return newComment;
  }

  async getCommentsByPostId(postId: number): Promise<Comment[]> {
    return await db
      .select()
      .from(comments)
      .where(eq(comments.postId, postId))
      .orderBy(desc(comments.createdAt));
  }

  async deleteComment(id: number, userId: string): Promise<void> {
    await db.delete(comments).where(and(eq(comments.id, id), eq(comments.userId, userId)));
  }

  // Follow operations
  async toggleFollow(followerId: string, followingId: string): Promise<boolean> {
    const existingFollow = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
      .limit(1);

    if (existingFollow.length > 0) {
      await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
      return false;
    } else {
      await db.insert(follows).values({ followerId, followingId });
      return true;
    }
  }

  async getFollowerCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followingId, userId));
    return result.count;
  }

  async getFollowingCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followerId, userId));
    return result.count;
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const [follow] = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
      .limit(1);
    return !!follow;
  }

  async getSuggestedUsers(userId: string, limit: number = 5): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(sql`${users.id} != ${userId} AND ${users.id} NOT IN (
        SELECT ${follows.followingId} FROM ${follows} WHERE ${follows.followerId} = ${userId}
      )`)
      .limit(limit);
  }

  // Story operations
  async createStory(story: InsertStory): Promise<Story> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    const [newStory] = await db.insert(stories).values({ ...story, expiresAt }).returning();
    return newStory;
  }

  async getActiveStories(): Promise<Story[]> {
    return await db
      .select()
      .from(stories)
      .where(sql`${stories.expiresAt} > NOW()`)
      .orderBy(desc(stories.createdAt));
  }

  async deleteExpiredStories(): Promise<void> {
    await db.delete(stories).where(lt(stories.expiresAt, new Date()));
  }

  // Admin operations
  async getAllUsers(limit: number = 50, offset: number = 0): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async banUser(userId: string, reason: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isBanned: true, bannedReason: reason, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async unbanUser(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isBanned: false, bannedReason: null, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async verifyUser(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isVerified: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async unverifyUser(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isVerified: false, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async makeAdmin(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isAdmin: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async removeAdmin(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isAdmin: false, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }
  
  // Hashtag operations
  async getTrendingHashtags(limit: number = 10): Promise<Array<{ tag: string; posts: number }>> {
    const result = await db.execute(sql`
      WITH hashtags AS (
        SELECT 
          unnest(regexp_split_to_array(caption, '\\s+')) as hashtag,
          id
        FROM posts 
        WHERE caption ~ '#\\w+'
      )
      SELECT 
        hashtag as tag,
        COUNT(*) as posts
      FROM hashtags
      WHERE hashtag ~ '^#\\w+'
      GROUP BY hashtag
      ORDER BY posts DESC
      LIMIT ${limit}
    `);
    
    return result.rows.map((row: any) => ({
      tag: row.tag,
      posts: parseInt(row.posts)
    }));
  }
  
  async getHashtagCount(hashtag: string): Promise<number> {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM posts 
      WHERE caption ILIKE '%' || ${hashtag} || '%'
    `);
    
    return parseInt((result.rows[0] as any)?.count || '0');
  }
}

export const storage = new DatabaseStorage();
