"""
Analytics Engine
Usa instagrapi (API privada) — sem Selenium
"""
import json
import os
import time
import random
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from collections import defaultdict
from dataclasses import dataclass, asdict

from utils import HumanBehavior, logger, print_info, print_success, print_error
from config import config


@dataclass
class HourlyActivity:
    hour: int
    active_users: int
    engagement_score: float


class AnalyticsEngine:
    """Motor de análise de dados via instagrapi"""

    def __init__(self, cl):
        self.cl = cl

        # Arquivos
        self.analytics_file = os.path.join(config.DATA_DIR, "analytics_data.json")

        # Dados
        self.data = self._load_data()

    def _load_data(self) -> Dict:
        try:
            from utils import load_json
            return load_json(self.analytics_file, {
                "follower_activity": {},
                "post_performance": [],
                "best_times": {},
                "audience_demographics": {},
                "last_updated": None
            })
        except:
            return {
                "follower_activity": {},
                "post_performance": [],
                "best_times": {},
                "audience_demographics": {},
                "last_updated": None
            }

    def save_data(self):
        self.data["last_updated"] = datetime.now().isoformat()
        from utils import save_json
        save_json(self.data, self.analytics_file)

    # ============================================
    # ANÁLISE DE ATIVIDADE
    # ============================================

    def analyze_follower_activity(self) -> Dict[int, int]:
        """
        Analisa quando seus seguidores estão mais ativos.
        Usa estimativa baseada em dados gerais do Instagram Brasil
        (a API web não expõe insights de audiência).
        """
        print_info("Analisando atividade dos seguidores...")

        # Estimativa baseada em dados gerais
        activity = self._estimate_activity()
        self.data["follower_activity"] = activity
        self.save_data()
        print_success("Análise de atividade concluída (estimativa)!")
        return activity

    def _estimate_activity(self) -> Dict[int, int]:
        """Estimativa baseada em dados gerais do Instagram Brasil"""
        print_info("Usando estimativa de atividade (padrão)")

        return {
            6: 15, 7: 25, 8: 45, 9: 60, 10: 55, 11: 50,
            12: 70, 13: 75, 14: 60, 15: 50, 16: 45, 17: 55,
            18: 70, 19: 80, 20: 85, 21: 75, 22: 60, 23: 40,
            0: 20, 1: 10, 2: 5, 3: 5, 4: 8, 5: 12
        }

    # ============================================
    # CÁLCULO DE MELHORES HORÁRIOS
    # ============================================

    def calculate_best_posting_times(self) -> List[Tuple[int, int, str]]:
        activity = self.data.get("follower_activity") or self._estimate_activity()

        day_multipliers = {
            0: 0.9,   # Segunda
            1: 1.0,   # Terça
            2: 1.1,   # Quarta (melhor)
            3: 1.0,   # Quinta
            4: 0.95,  # Sexta
            5: 0.7,   # Sábado
            6: 0.6    # Domingo
        }

        today = datetime.now().weekday()
        scores = []

        for hour, base_activity in activity.items():
            score = int(base_activity) * day_multipliers.get(today, 1.0)

            if score >= 70:
                recommendation = "🟢 EXCELENTE"
            elif score >= 50:
                recommendation = "🟡 BOM"
            elif score >= 30:
                recommendation = "🟠 REGULAR"
            else:
                recommendation = "🔴 EVITAR"

            scores.append((int(hour), int(score), recommendation))

        scores.sort(key=lambda x: x[1], reverse=True)

        self.data["best_times"] = {
            "top_5": scores[:5],
            "all_hours": scores,
            "updated_at": datetime.now().isoformat()
        }
        self.save_data()

        return scores

    def get_optimal_schedule(self, posts_per_day: int = 2) -> List[datetime]:
        best_times = self.calculate_best_posting_times()
        top_hours = [t[0] for t in best_times[:posts_per_day]]

        now = datetime.now()
        schedule = []

        for hour in sorted(top_hours):
            post_time = now.replace(hour=hour, minute=random.randint(0, 30), second=0)

            if post_time < now:
                post_time += timedelta(days=1)

            schedule.append(post_time)

        return schedule

    # ============================================
    # ANÁLISE DE PERFORMANCE
    # ============================================

    def analyze_post_performance(self, num_posts: int = 9) -> Dict:
        """Analisa performance dos posts recentes via API"""
        print_info(f"Analisando {num_posts} posts recentes...")

        try:
            user_id = int(self.cl.user_id) if self.cl.user_id else 0
            if not user_id:
                print_error("User ID não disponível")
                return {}
            medias = self.cl.user_medias(user_id, amount=num_posts)

            performance_data = []

            for media in medias:
                try:
                    metrics = {
                        "likes": media.like_count or 0,
                        "comments": media.comment_count or 0,
                        "engagement": (media.like_count or 0) + ((media.comment_count or 0) * 2),
                        "posted_at": media.taken_at.isoformat() if media.taken_at else None,
                        "media_type": str(media.media_type),
                        "caption": (media.caption_text or "")[:100],
                        "url": f"https://www.instagram.com/p/{media.code}/",
                    }
                    performance_data.append(metrics)
                except Exception as e:
                    logger.warning(f"Erro ao extrair métricas de post: {e}")
                    continue

            if performance_data:
                avg_engagement = sum(p["engagement"] for p in performance_data) / len(performance_data)
                best_post = max(performance_data, key=lambda x: x["engagement"])

                analysis = {
                    "total_analyzed": len(performance_data),
                    "avg_engagement": avg_engagement,
                    "best_post": best_post,
                    "posts": performance_data,
                    "analyzed_at": datetime.now().isoformat()
                }

                self.data["post_performance"] = analysis
                self.save_data()

                print_success(f"Performance analisada: {len(performance_data)} posts")
                return analysis

        except Exception as e:
            if '429' in str(e):
                logger.warning("⏳ Rate limit. Tente novamente em alguns minutos.")
            else:
                logger.error(f"Erro na análise de performance: {e}")

        return {}

    # ============================================
    # RELATÓRIOS
    # ============================================

    def generate_report(self) -> str:
        best_times = self.calculate_best_posting_times()
        performance = self.data.get("post_performance", {})

        report = f"""
╔══════════════════════════════════════════════════════════╗
║           📊 RELATÓRIO DE ANALYTICS                      ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  🕐 MELHORES HORÁRIOS PARA POSTAR:                      ║
║                                                          ║"""

        for i, (hour, score, rec) in enumerate(best_times[:5], 1):
            report += f"\n║  {i}. {hour:02d}:00 - Score: {score}/100 {rec:12} ║"

        report += f"""
║                                                          ║
║  📈 PERFORMANCE DOS POSTS:                              ║
║  • Posts analisados: {performance.get('total_analyzed', 0)}                          ║
║  • Engajamento médio: {performance.get('avg_engagement', 0):.0f}                      ║
║  • Melhor post: {performance.get('best_post', {}).get('engagement', 0):.0f} engajamentos           ║
║                                                          ║
║  💡 RECOMENDAÇÕES:                                      ║
║  • Poste entre {best_times[0][0]:02d}:00 e {best_times[1][0]:02d}:00 para máximo alcance    ║
║  • Evite postar antes das 07:00 e após 23:00           ║
║  • Quarta-feira é o melhor dia da semana               ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
        """
        return report

    def export_best_times(self) -> Dict:
        best_times = self.calculate_best_posting_times()

        return {
            "primeiro_post": best_times[0][0] if best_times else 9,
            "segundo_post": best_times[1][0] if len(best_times) > 1 else 19,
            "terceiro_post": best_times[2][0] if len(best_times) > 2 else 13,
            "evitar": [h[0] for h in best_times[-5:]]
        }

    def get_weekly_growth_projection(self) -> Dict:
        best_times = self.calculate_best_posting_times()
        peak_hours = [h[0] for h in best_times[:3]]

        return {
            "melhores_horarios": peak_hours,
            "posts_recomendados_semana": config.POSTS_PER_DAY * 7,
            "projecao_alcance": f"{len(peak_hours) * config.POSTS_PER_DAY * 7 * 100}+",
            "projecao_engajamento": f"{len(peak_hours) * config.POSTS_PER_DAY * 7 * 5}+"
        }

# Importações
from utils import load_json, save_json, print_info, print_success, print_error
