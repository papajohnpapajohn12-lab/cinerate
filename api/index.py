"""
Vercel Serverless Entry Point - ASGI Handler Class
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import FastAPI app
from main import app
from mangum import Mangum

# Create Mangum ASGI handler instance
_mangum_handler = Mangum(app, lifespan="off")

class handler:
    """
    Vercel serverless handler class
    """
    def __init__(self, scope=None):
        self.scope = scope
    
    def __call__(self, event, context):
        """
        AWS Lambda / Vercel entry point
        """
        return _mangum_handler(event, context)
