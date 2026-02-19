"""
Vercel Serverless Entry Point for CineRate API
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import main app
from main import app
from mangum import Mangum

# Create handler for Vercel serverless
handler = Mangum(app, lifespan="off")
