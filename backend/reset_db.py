"""
Reset database tables for CineRate
Run this to clear all data and start fresh
"""
import asyncio
import httpx
from dotenv import load_dotenv
import os
import sys

load_dotenv()

TURSO_URL = os.getenv("TURSO_DATABASE_URL", "").replace("libsql://", "https://")
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "")

async def reset_database():
    if not TURSO_URL or not TURSO_TOKEN:
        print("[ERROR] Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env")
        return
    
    # Check for --force flag
    force = "--force" in sys.argv
    
    if not force:
        print("[WARNING] This will DELETE ALL DATA in the database!")
        print("Tables to drop: users, ratings")
        confirm = input("Type 'yes' to confirm: ")
        
        if confirm.lower() != "yes":
            print("Cancelled.")
            return
    else:
        print("[INFO] Force mode enabled, skipping confirmation")
    
    async with httpx.AsyncClient() as client:
        # Drop tables
        for table in ["ratings", "users"]:
            try:
                r = await client.post(
                    f"{TURSO_URL}/v2/pipeline",
                    headers={
                        "Authorization": f"Bearer {TURSO_TOKEN}",
                        "Content-Type": "application/json"
                    },
                    json={"requests": [
                        {"type": "execute", "stmt": {"sql": f"DROP TABLE IF EXISTS {table}"}},
                        {"type": "close"}
                    ]}
                )
                if r.status_code == 200:
                    print(f"[OK] Dropped table: {table}")
                else:
                    print(f"[WARN] Could not drop {table}: {r.status_code}")
            except Exception as e:
                print(f"[WARN] Error dropping {table}: {e}")
    
    print("\n[OK] Database reset complete!")
    print("Next: Restart the backend server to recreate tables.")

if __name__ == "__main__":
    asyncio.run(reset_database())
