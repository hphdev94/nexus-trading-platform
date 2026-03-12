-- Performance indexes
CREATE INDEX idx_users_name ON users (name);
CREATE INDEX idx_orders_user_id ON orders (user_id);
