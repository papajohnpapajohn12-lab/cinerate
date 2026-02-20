"""
Vercel Serverless Entry Point for CineRate API
"""
import sys
import os
import traceback

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    # Import main app
    from main import app
    from mangum import Mangum
    
    # Create handler for Vercel serverless
    handler = Mangum(app, lifespan="off")
    print("[VERCEL] Handler created successfully")
    
except Exception as e:
    error_msg = f"Import error: {type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
    print(f"[VERCEL ERROR] {error_msg}")
    
    # Create fallback handler that returns error
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    
    app = FastAPI()
    
    @app.get("/{path:path}")
    @app.post("/{path:path}")
    @app.put("/{path:path}")
    @app.delete("/{path:path}")
    async def error_handler(path: str):
        return JSONResponse(
            status_code=500,
            content={
                "error": "Server initialization failed",
                "detail": str(e),
                "traceback": traceback.format_exc().split("\n")
            }
        )
    
    from mangum import Mangum
    handler = Mangum(app, lifespan="off")
