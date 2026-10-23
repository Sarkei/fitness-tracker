import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';

export interface Post {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  content: string;
  imageUrl?: string;
  likes: string[];
  type: 'manual' | 'workout';
  workoutId?: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  content: string;
  createdAt: string;
}

export type FeedScope = 'global' | 'following';

export function useSocial(scope: FeedScope = 'global') {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState(false);

  const fetchPosts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const q = scope === 'following' ? '?scope=following' : '';
      const data = await api<Post[]>(`/api/posts${q}`);
      setPosts(data);
      setFeedError(false);
    } catch (err) {
      console.error('useSocial fetch error:', err);
      if (!silent) setFeedError(true);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    if (user) fetchPosts();
  }, [user, fetchPosts]);

  const createPost = async (content: string, imageUrl?: string, type: 'manual' | 'workout' = 'manual', workoutId?: string) => {
    await api('/api/posts', { method: 'POST', body: JSON.stringify({ content, imageUrl, type, workoutId }) });
    await fetchPosts(true);
  };

  const toggleLike = async (postId: string, isLiked: boolean) => {
    if (!user) return;
    const uid = user.uid;
    setPosts(prev =>
      prev.map(p => {
        if (p.id !== postId) return p;
        const likes = [...p.likes];
        if (isLiked) return { ...p, likes: likes.filter(id => id !== uid) };
        if (!likes.includes(uid)) likes.push(uid);
        return { ...p, likes };
      }),
    );
    try {
      if (isLiked) await api(`/api/posts/${postId}/like`, { method: 'DELETE' });
      else await api(`/api/posts/${postId}/like`, { method: 'POST' });
    } catch {
      await fetchPosts(true);
    }
  };

  const deletePost = async (postId: string) => {
    let previous: Post[] = [];
    setPosts(prev => {
      previous = prev;
      return prev.filter(p => p.id !== postId);
    });
    try {
      await api(`/api/posts/${postId}`, { method: 'DELETE' });
    } catch {
      setPosts(previous);
      throw new Error('delete_failed');
    }
  };

  return { posts, loading, feedError, createPost, toggleLike, deletePost, refetch: fetchPosts };
}

export function useComments(postId: string) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);

  const fetchComments = useCallback(async () => {
    if (!postId) return;
    try {
      const data = await api<Comment[]>(`/api/posts/${postId}/comments`);
      setComments(data);
    } catch {
      // ignore
    }
  }, [postId]);

  useEffect(() => {
    if (user) fetchComments();
  }, [user, fetchComments]);

  const addComment = async (content: string) => {
    await api(`/api/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
    await fetchComments();
  };

  return { comments, addComment };
}
