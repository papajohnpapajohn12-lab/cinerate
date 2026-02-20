"""
FilmRate Backend - Working Version
"""
import os
import sys
import httpx
import hashlib
import secrets
import json
import traceback
from datetime import datetime, timedelta
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

# ===== CONFIG =====
class Settings(BaseSettings):
    TURSO_DATABASE_URL: str = os.environ.get("TURSO_DATABASE_URL", "")
    TURSO_AUTH_TOKEN: str = os.environ.get("TURSO_AUTH_TOKEN", "")
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "fallback-secret-key-change-in-production")
    TMDB_API_KEY: str = os.environ.get("TMDB_API_KEY", "")
    TMDB_BASE_URL: str = "https://api.themoviedb.org/3"
    
    class Config:
        env_file = ".env"

try:
    settings = Settings()
    print(f"[INIT] Settings loaded. DB URL: {settings.TURSO_DATABASE_URL[:20]}..." if settings.TURSO_DATABASE_URL else "[INIT] WARNING: TURSO_DATABASE_URL is empty!")
except Exception as e:
    print(f"[INIT ERROR] Failed to load settings: {e}")
    settings = None

# ===== DATABASE =====
import httpx as hx

class DB:
    def __init__(self):
        self.url = settings.TURSO_DATABASE_URL.replace("libsql://", "https://")
        self.token = settings.TURSO_AUTH_TOKEN
        self.client = hx.AsyncClient()
    
    async def close(self):
        await self.client.aclose()
    
    def _make_args(self, params):
        args = []
        for p in params or []:
            if p is None:
                args.append({"type": "null"})
            elif isinstance(p, bool):
                args.append({"type": "integer", "value": "1" if p else "0"})
            elif isinstance(p, int):
                args.append({"type": "integer", "value": str(p)})
            elif isinstance(p, float):
                args.append({"type": "float", "value": p})
            else:
                args.append({"type": "text", "value": str(p)})
        return args
    
    async def exec(self, sql: str, params: list = None):
        # Use batch with close to commit
        r = await self.client.post(
            f"{self.url}/v2/pipeline",
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
            json={"requests": [
                {"type": "execute", "stmt": {"sql": sql, "args": self._make_args(params)}},
                {"type": "close"}
            ]}
        )
        if r.status_code != 200:
            raise Exception(f"DB error: {r.text}")
        data = r.json()
        # Check for errors in results
        if "results" in data:
            for res in data["results"]:
                if res.get("type") == "error":
                    raise Exception(f"DB exec error: {res}")
        return data
    
    async def fetch(self, sql: str, params: list = None) -> List[dict]:
        r = await self.client.post(
            f"{self.url}/v2/pipeline",
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
            json={"requests": [
                {"type": "execute", "stmt": {"sql": sql, "args": self._make_args(params)}},
                {"type": "close"}
            ]}
        )
        if r.status_code != 200:
            raise Exception(f"DB error: {r.text}")
        
        data = r.json()
        rows = []
        if "results" in data and data["results"]:
            res = data["results"][0]
            if "response" in res and "result" in res["response"]:
                result = res["response"]["result"]
                cols = [c["name"] for c in result.get("cols", [])]
                for row_data in result.get("rows", []):
                    row = {}
                    for i, col in enumerate(cols):
                        cell = row_data[i] if i < len(row_data) else {}
                        t = cell.get("type")
                        if t == "text":
                            row[col] = cell.get("value")
                        elif t == "integer":
                            row[col] = int(cell.get("value", 0))
                        elif t == "float":
                            row[col] = float(cell.get("value", 0))
                        elif t == "null":
                            row[col] = None
                        else:
                            row[col] = cell.get("value")
                    rows.append(row)
        return rows

db: Optional[DB] = None

# ===== SECURITY =====
security = HTTPBearer()

def hash_pwd(pwd: str) -> str:
    salt = secrets.token_hex(16)
    return f"{salt}${hashlib.sha256((pwd + salt).encode()).hexdigest()}"

def verify_pwd(pwd: str, hashed: str) -> bool:
    if "$" not in hashed:
        return False
    salt, h = hashed.split("$")
    return hashlib.sha256((pwd + salt).encode()).hexdigest() == h

def make_token(user_id: int) -> str:
    # Simple token: user_id:timestamp:signature
    ts = int(datetime.utcnow().timestamp())
    sig = hashlib.sha256(f"{user_id}:{ts}:{settings.SECRET_KEY}".encode()).hexdigest()[:16]
    return f"{user_id}:{ts}:{sig}"

def check_token(token: str) -> Optional[int]:
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return None
        user_id, ts, sig = int(parts[0]), int(parts[1]), parts[2]
        
        # Check expiry (24 hours)
        if datetime.utcnow().timestamp() - ts > 86400:
            return None
        
        # Check signature
        expected = hashlib.sha256(f"{user_id}:{ts}:{settings.SECRET_KEY}".encode()).hexdigest()[:16]
        if sig != expected:
            return None
        
        return user_id
    except:
        return None

async def get_user(cred: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    user_id = check_token(cred.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    users = await db.fetch("SELECT id, username, display_name FROM users WHERE id = ?", [user_id])
    if not users:
        raise HTTPException(status_code=401, detail="User not found")
    
    return users[0]

# ===== MODELS =====
class RegData(BaseModel):
    username: str
    password: str
    display_name: Optional[str] = None
    email: Optional[str] = None

class LoginData(BaseModel):
    username: str
    password: str

class RatingData(BaseModel):
    tmdb_id: int
    title: str
    year: Optional[int] = None
    poster_path: Optional[str] = None
    tmdb_rating: Optional[float] = None
    user_rating: int = Field(..., ge=1, le=10)
    comment: Optional[str] = None
    genres: Optional[str] = None
    overview: Optional[str] = None
    media_type: Optional[str] = "movie"

class WatchlistData(BaseModel):
    tmdb_id: int
    title: str
    year: Optional[int] = None
    poster_path: Optional[str] = None
    tmdb_rating: Optional[float] = None
    genres: Optional[str] = None
    overview: Optional[str] = None
    media_type: Optional[str] = "movie"

class ProfileUpdate(BaseModel):
    display_name: str

# ===== APP =====
@asynccontextmanager
async def lifespan(app: FastAPI):
    global db
    db = DB()
    
    # Create tables
    try:
        # Create users table (with email column included)
        await db.exec("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE,
                hashed_password TEXT NOT NULL,
                display_name TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("[OK] Users table ready!")
        
        # Create ratings table
        await db.exec("""
            CREATE TABLE IF NOT EXISTS ratings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                media_type TEXT DEFAULT 'movie',
                tmdb_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                year INTEGER,
                poster_path TEXT,
                tmdb_rating REAL,
                user_rating INTEGER NOT NULL,
                comment TEXT,
                genres TEXT,
                overview TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, tmdb_id)
            )
        """)
        # Try to add comment column if not exists (for existing tables)
        try:
            await db.exec("ALTER TABLE ratings ADD COLUMN comment TEXT")
        except:
            pass
        print("[OK] Ratings table ready!")
        
        # Create watchlist table
        await db.exec("""
            CREATE TABLE IF NOT EXISTS watchlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                media_type TEXT DEFAULT 'movie',
                tmdb_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                year INTEGER,
                poster_path TEXT,
                tmdb_rating REAL,
                genres TEXT,
                overview TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, tmdb_id)
            )
        """)
        print("[OK] Watchlist table ready!")
        print("[OK] Database initialized successfully!")
    except Exception as e:
        print(f"[ERROR] DB init failed: {e}")
        import traceback
        traceback.print_exc()
    
    yield
    await db.close()

app = FastAPI(title="FilmRate", lifespan=lifespan)

# Mount static files
if os.path.exists("frontend"):
    app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = f"{type(exc).__name__}: {str(exc)}"
    traceback_str = traceback.format_exc()
    print(f"[ERROR] {error_msg}\n{traceback_str}")
    return JSONResponse(
        status_code=500,
        content={"detail": error_msg, "traceback": traceback_str.split("\n")[-5:]}
    )

@app.middleware("http")
async def cors(req, call_next):
    if req.method == "OPTIONS":
        return JSONResponse(content={}, headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*"
        })
    res = await call_next(req)
    res.headers["Access-Control-Allow-Origin"] = "*"
    res.headers["Access-Control-Allow-Methods"] = "*"
    res.headers["Access-Control-Allow-Headers"] = "*"
    return res

# ===== ROUTES =====
@app.get("/")
def root():
    return {"ok": True, "service": "CineRate API"}

@app.get("/health")
async def health():
    """Health check endpoint that also verifies DB connection"""
    try:
        # Test DB connection
        result = await db.fetch("SELECT 1 as test")
        return {"status": "ok", "database": "connected", "timestamp": datetime.utcnow().isoformat()}
    except Exception as e:
        return {"status": "error", "database": str(e), "timestamp": datetime.utcnow().isoformat()}

# Auth
@app.post("/auth/register")
async def register(data: RegData):
    try:
        # Check exists
        existing = await db.fetch("SELECT id FROM users WHERE username = ?", [data.username])
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
        
        # Create
        hashed = hash_pwd(data.password)
        display = data.display_name or data.username
        email = data.email or f"{data.username}@placeholder.com"
        
        await db.exec(
            "INSERT INTO users (username, hashed_password, display_name, email) VALUES (?, ?, ?, ?)",
            [data.username, hashed, display, email]
        )
        
        # Get user
        users = await db.fetch("SELECT id, username, display_name, email FROM users WHERE username = ?", [data.username])
        if not users:
            raise HTTPException(status_code=500, detail="Failed to create user")
        user = users[0]
        
        return {"access_token": make_token(user["id"]), "user": user}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Register failed: {e}")
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/auth/login")
async def login(data: LoginData):
    users = await db.fetch(
        "SELECT id, username, display_name, hashed_password FROM users WHERE username = ?",
        [data.username]
    )
    
    if not users or not verify_pwd(data.password, users[0]["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = {k: v for k, v in users[0].items() if k != "hashed_password"}
    return {"access_token": make_token(user["id"]), "user": user}

@app.get("/auth/me")
async def me(user: dict = Depends(get_user)):
    return user

@app.post("/auth/update_profile")
async def update_profile(data: ProfileUpdate, user: dict = Depends(get_user)):
    await db.exec(
        "UPDATE users SET display_name = ? WHERE id = ?",
        [data.display_name, user["id"]]
    )
    return {"display_name": data.display_name}

# Movies - Order matters! Static routes first, then dynamic
@app.get("/movies/popular")
async def popular(user: dict = Depends(get_user)):
    # Get trending movies and TV shows
    async with hx.AsyncClient() as c:
        # Get trending movies
        r_movies = await c.get(
            f"{settings.TMDB_BASE_URL}/trending/movie/week",
            params={"api_key": settings.TMDB_API_KEY, "language": "ru-RU"}
        )
        # Get trending TV shows
        r_tv = await c.get(
            f"{settings.TMDB_BASE_URL}/trending/tv/week",
            params={"api_key": settings.TMDB_API_KEY, "language": "ru-RU"}
        )
    
    results = []
    if r_movies.status_code == 200:
        for m in r_movies.json().get("results", []):
            if m.get("poster_path"):
                m["media_type"] = "movie"
                results.append(m)
    if r_tv.status_code == 200:
        for t in r_tv.json().get("results", []):
            if t.get("poster_path"):
                t["media_type"] = "tv"
                t["title"] = t.get("name", t.get("title", "Без названия"))
                t["release_date"] = t.get("first_air_date", t.get("release_date", ""))
                results.append(t)
    
    # Shuffle and limit results
    import random
    random.shuffle(results)
    return {"results": results[:20]}

@app.get("/movies/search")
async def search(query: str, user: dict = Depends(get_user)):
    async with hx.AsyncClient() as c:
        # Search movies
        r_movies = await c.get(
            f"{settings.TMDB_BASE_URL}/search/movie",
            params={"api_key": settings.TMDB_API_KEY, "query": query, "language": "ru-RU"}
        )
        # Search TV shows
        r_tv = await c.get(
            f"{settings.TMDB_BASE_URL}/search/tv",
            params={"api_key": settings.TMDB_API_KEY, "query": query, "language": "ru-RU"}
        )
    
    results = []
    if r_movies.status_code == 200:
        for m in r_movies.json().get("results", []):
            if m.get("poster_path"):
                m["media_type"] = "movie"
                results.append(m)
    if r_tv.status_code == 200:
        for t in r_tv.json().get("results", []):
            if t.get("poster_path"):
                t["media_type"] = "tv"
                t["title"] = t.get("name", t.get("title", "Без названия"))
                t["release_date"] = t.get("first_air_date", t.get("release_date", ""))
                results.append(t)
    
    # Sort by popularity
    results.sort(key=lambda x: x.get("popularity", 0), reverse=True)
    return {"results": results}

@app.get("/movies/top_rated")
async def top_rated(user: dict = Depends(get_user)):
    async with hx.AsyncClient() as c:
        r_movies = await c.get(
            f"{settings.TMDB_BASE_URL}/movie/top_rated",
            params={"api_key": settings.TMDB_API_KEY, "language": "ru-RU"}
        )
        r_tv = await c.get(
            f"{settings.TMDB_BASE_URL}/tv/top_rated",
            params={"api_key": settings.TMDB_API_KEY, "language": "ru-RU"}
        )
    
    results = []
    if r_movies.status_code == 200:
        for m in r_movies.json().get("results", [])[:10]:
            if m.get("poster_path"):
                m["media_type"] = "movie"
                results.append(m)
    if r_tv.status_code == 200:
        for t in r_tv.json().get("results", [])[:10]:
            if t.get("poster_path"):
                t["media_type"] = "tv"
                t["title"] = t.get("name", t.get("title", "Без названия"))
                t["release_date"] = t.get("first_air_date", t.get("release_date", ""))
                results.append(t)
    
    results.sort(key=lambda x: x.get("vote_average", 0), reverse=True)
    return {"results": results[:20]}

@app.get("/movies/{movie_id}")
async def movie_detail(movie_id: int, media_type: str = "movie", user: dict = Depends(get_user)):
    async with hx.AsyncClient() as c:
        if media_type == "tv":
            # Try TV first
            r = await c.get(
                f"{settings.TMDB_BASE_URL}/tv/{movie_id}",
                params={"api_key": settings.TMDB_API_KEY, "language": "ru-RU"}
            )
            if r.status_code == 200:
                data = r.json()
                data["title"] = data.get("name", data.get("title", "Без названия"))
                data["release_date"] = data.get("first_air_date", data.get("release_date", ""))
                return data
        else:
            # Try movie first, then TV as fallback
            r = await c.get(
                f"{settings.TMDB_BASE_URL}/movie/{movie_id}",
                params={"api_key": settings.TMDB_API_KEY, "language": "ru-RU"}
            )
            if r.status_code == 200:
                return r.json()
            # Fallback to TV
            r = await c.get(
                f"{settings.TMDB_BASE_URL}/tv/{movie_id}",
                params={"api_key": settings.TMDB_API_KEY, "language": "ru-RU"}
            )
            if r.status_code == 200:
                data = r.json()
                data["title"] = data.get("name", data.get("title", "Без названия"))
                data["release_date"] = data.get("first_air_date", data.get("release_date", ""))
                return data
    raise HTTPException(status_code=404, detail="Not found")

# Ratings
@app.get("/ratings")
async def get_ratings(user: dict = Depends(get_user)):
    return await db.fetch(
        """SELECT id, tmdb_id, title, year, poster_path, tmdb_rating, 
            user_rating, comment, genres, overview, media_type, created_at FROM ratings 
            WHERE user_id = ? ORDER BY created_at DESC""",
        [user["id"]]
    )

@app.post("/ratings")
async def save_rating(data: RatingData, user: dict = Depends(get_user)):
    # Check exists
    existing = await db.fetch(
        "SELECT id FROM ratings WHERE user_id = ? AND tmdb_id = ?",
        [user["id"], data.tmdb_id]
    )
    
    media_type = data.media_type or "movie"
    comment = data.comment if data.comment else None
    
    if existing:
        await db.exec(
            "UPDATE ratings SET user_rating = ?, comment = ?, media_type = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND tmdb_id = ?",
            [data.user_rating, comment, media_type, user["id"], data.tmdb_id]
        )
    else:
        await db.exec(
            """INSERT INTO ratings (user_id, tmdb_id, title, year, poster_path, tmdb_rating,
                user_rating, comment, genres, overview, media_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [user["id"], data.tmdb_id, data.title, data.year, data.poster_path,
             data.tmdb_rating, data.user_rating, comment, data.genres, data.overview, media_type]
        )
    
    rows = await db.fetch(
        "SELECT * FROM ratings WHERE user_id = ? AND tmdb_id = ?",
        [user["id"], data.tmdb_id]
    )
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to save rating")
    return rows[0]

@app.delete("/ratings/{tmdb_id}")
async def delete_rating(tmdb_id: int, user: dict = Depends(get_user)):
    await db.exec("DELETE FROM ratings WHERE user_id = ? AND tmdb_id = ?", [user["id"], tmdb_id])
    return {"ok": True}

@app.get("/ratings/stats")
async def stats(user: dict = Depends(get_user)):
    rows = await db.fetch("SELECT user_rating, genres, media_type, year FROM ratings WHERE user_id = ?", [user["id"]])
    
    if not rows:
        return {"total": 0, "average": 0, "max": 0, "min": 0,
                "distribution": {str(i): 0 for i in range(1, 11)}, "genres": [], "by_type": {"movie": 0, "tv": 0}, "by_year": []}
    
    ratings = [r["user_rating"] for r in rows]
    dist = {str(i): 0 for i in range(1, 11)}
    for r in ratings:
        dist[str(r)] += 1
    
    genres = {}
    by_type = {"movie": 0, "tv": 0}
    by_year = {}
    
    for r in rows:
        # Count by type
        media_type = r.get("media_type") or "movie"
        if media_type in by_type:
            by_type[media_type] += 1
        # Count genres
        if r.get("genres"):
            for g in r["genres"].split(","):
                g = g.strip()
                if g:
                    genres[g] = genres.get(g, 0) + 1
        # Count by year
        year = r.get("year")
        if year:
            by_year[year] = by_year.get(year, 0) + 1
    
    top_genres = [{"name": k, "count": v} for k, v in sorted(genres.items(), key=lambda x: x[1], reverse=True)[:8]]
    
    # Sort years descending, take last 10 years with ratings
    sorted_years = sorted(by_year.items(), key=lambda x: x[0], reverse=True)[:10]
    years_data = [{"year": k, "count": v} for k, v in sorted_years]
    
    return {
        "total": len(ratings),
        "average": round(sum(ratings) / len(ratings), 2),
        "max": max(ratings),
        "min": min(ratings),
        "distribution": dist,
        "genres": top_genres,
        "by_type": by_type,
        "by_year": years_data
    }

# Export user data
@app.get("/ratings/export")
async def export_data(user: dict = Depends(get_user)):
    rows = await db.fetch(
        """SELECT tmdb_id, title, year, poster_path, tmdb_rating, 
            user_rating, genres, overview, media_type, created_at, updated_at 
            FROM ratings WHERE user_id = ? ORDER BY created_at DESC""",
        [user["id"]]
    )
    return {
        "user": {"id": user["id"], "username": user["username"], "display_name": user.get("display_name")},
        "export_date": datetime.utcnow().isoformat(),
        "total_ratings": len(rows),
        "ratings": rows
    }

# Watchlist endpoints
@app.get("/watchlist")
async def get_watchlist(user: dict = Depends(get_user)):
    rows = await db.fetch(
        """SELECT id, tmdb_id, title, year, poster_path, tmdb_rating, 
            genres, overview, media_type, created_at FROM watchlist 
            WHERE user_id = ? ORDER BY created_at DESC""",
        [user["id"]]
    )
    return {"items": rows}

@app.post("/watchlist")
async def add_to_watchlist(data: WatchlistData, user: dict = Depends(get_user)):
    # Check if already in watchlist
    existing = await db.fetch(
        "SELECT id FROM watchlist WHERE user_id = ? AND tmdb_id = ?",
        [user["id"], data.tmdb_id]
    )
    
    if existing:
        raise HTTPException(status_code=400, detail="Already in watchlist")
    
    media_type = data.media_type or "movie"
    
    await db.exec(
        """INSERT INTO watchlist (user_id, tmdb_id, title, year, poster_path, tmdb_rating,
            genres, overview, media_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [user["id"], data.tmdb_id, data.title, data.year, data.poster_path,
         data.tmdb_rating, data.genres, data.overview, media_type]
    )
    
    return {"ok": True}

@app.delete("/watchlist/{tmdb_id}")
async def remove_from_watchlist(tmdb_id: int, user: dict = Depends(get_user)):
    await db.exec("DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ?", [user["id"], tmdb_id])
    return {"ok": True}

@app.get("/watchlist/check/{tmdb_id}")
async def check_watchlist(tmdb_id: int, user: dict = Depends(get_user)):
    rows = await db.fetch(
        "SELECT id FROM watchlist WHERE user_id = ? AND tmdb_id = ?",
        [user["id"], tmdb_id]
    )
    return {"in_watchlist": len(rows) > 0}

# SPA catch-all - serve index.html for all non-API routes
@app.get("/{path:path}")
async def serve_spa(path: str):
    # API routes are handled above, this is for everything else
    if path.startswith("api/") or path.startswith("frontend/"):
        return JSONResponse({"detail": "Not found"}, status_code=404)
    return FileResponse("index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
