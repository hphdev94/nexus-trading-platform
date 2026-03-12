-- Database schema
CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100));
CREATE TABLE orders (id INT PRIMARY KEY, user_id INT, amount DECIMAL);
