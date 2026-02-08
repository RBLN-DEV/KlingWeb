#!/usr/bin/env python3
"""
Instagram Growth Suite - Sistema Completo
Automação Inteligente de Crescimento
"""
import os
import sys
import signal
import time
import json
import threading

# Adiciona src ao path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from utils import (
    print_banner, print_menu, print_success, 
    print_error, print_info, print_warning
)
from bot import InstagramBot
from config import config

# Variável global para o bot
bot = None

def signal_handler(sig, frame):
    """Handler de interrupção"""
    print("\n")
    print_warning("Interrupção detectada!")
    
    if bot:
        print_info("Encerrando bot graciosamente...")
        try:
            if bot.content_scheduler.is_daemon_running():
                bot.content_scheduler.stop_daemon()
            bot.quit()
        except:
            pass
    
    print_success("Até logo! 👋")
    sys.exit(0)

def check_requirements():
    """Verifica requisitos"""
    # Verifica .env
    if not os.path.exists('.env'):
        print_error("Arquivo .env não encontrado!")
        print_info("Copie .env.example para .env e configure suas credenciais")
        return False
    
    # Verifica credenciais
    from dotenv import load_dotenv
    load_dotenv()
    
    if not os.getenv('IG_USERNAME') or not os.getenv('IG_PASSWORD'):
        print_error("Credenciais não configuradas!")
        print_info("Edite o arquivo .env e adicione:")
        print("  IG_USERNAME=seu_usuario")
        print("  IG_PASSWORD=sua_senha")
        return False
    
    return True

def menu_crescimento():
    """Menu de crescimento"""
    while True:
        print("""
╔══════════════════════════════════════════════════════════╗
║  👥 MENU DE CRESCIMENTO                                  ║
╠══════════════════════════════════════════════════════════╣
║  [1] 🚀 Sessão Completa (Balanceada)                    ║
║  [2] ⚡ Sessão Agressiva (Máximo crescimento)           ║
║  [3] 🛡️  Sessão Segura (Contas novas)                   ║
║  [4] 🎯 Follow em Curtidores (Alta conversão)           ║
║  [5] 🧹 Unfollow Inteligente                            ║
║  [6] 📱 Story Engagement                                ║
║  [7] 💬 Comentários Estratégicos                        ║
║  [8] ❤️  Curtir por Hashtag                             ║
║  [0] ↩️  Voltar                                         ║
╚══════════════════════════════════════════════════════════╝
        """)
        
        choice = input("Escolha: ").strip()
        
        if choice == "1":
            bot.run_growth_session("balanced")
        elif choice == "2":
            confirm = input("⚠️  Agressivo tem maior risco de bloqueio. Continuar? (s/n): ")
            if confirm.lower() == 's':
                bot.run_growth_session("aggressive")
        elif choice == "3":
            bot.run_growth_session("safe")
        elif choice == "4":
            url = input("URL do post do influenciador: ").strip()
            qty = int(input("Quantidade de follows (máx 30): ") or "15")
            bot.growth_engine.follow_recent_likers(url, qty)
        elif choice == "5":
            qty = int(input("Máximo de unfollows: ") or "30")
            bot.followers_manager.clean_non_followers(qty)
        elif choice == "6":
            tags_input = input("Hashtags (separadas por vírgula): ").strip()
            if not tags_input:
                print_error("Nenhuma hashtag informada!")
                continue
            tags = [t.strip() for t in tags_input.split(",") if t.strip()]
            qty = int(input("Quantidade de stories: ") or "50")
            bot.growth_engine.mass_story_engagement(tags, qty)
        elif choice == "7":
            urls_input = input("URLs dos posts (separadas por vírgula): ").strip()
            if not urls_input:
                print_error("Nenhuma URL informada!")
                continue
            urls = [u.strip() for u in urls_input.split(",") if u.strip()]
            qty = int(input("Quantidade de comentários: ") or "5")
            bot.growth_engine.strategic_commenting(urls, qty)
        elif choice == "8":
            tag = input("Hashtag: ").strip()
            qty = int(input("Quantidade de curtidas: ") or "20")
            bot.growth_engine.like_by_hashtag(tag, qty)
        elif choice == "0":
            break
        
        input("\nPressione Enter para continuar...")

def menu_conteudo():
    """Menu de conteúdo"""
    while True:
        print("""
╔══════════════════════════════════════════════════════════╗
║  📤 MENU DE CONTEÚDO                                     ║
╠══════════════════════════════════════════════════════════╣
║                   📸 UPLOAD DIRETO                       ║
║  [1] 🖼️  Publicar Foto no Feed                          ║
║  [2] 🎬 Publicar Vídeo no Feed                          ║
║  [3] 📱 Publicar Story (foto)                           ║
║  [4] 📱 Publicar Story (vídeo)                          ║
║  [5] 🎞️  Publicar Reel                                  ║
║                                                          ║
║                   📅 AGENDAMENTO                         ║
║  [6] 📅 Agendar Semana Automaticamente                  ║
║  [7] ➕ Agendar Post Manualmente                        ║
║  [8] 📋 Ver Posts Agendados                             ║
║  [9] ❌ Cancelar Post                                   ║
║  [10] 🚀 Publicar Agora (post mais antigo)              ║
║  [11] 🤖 Iniciar Auto-Publicação (Daemon)               ║
║  [12] ⏹️  Parar Auto-Publicação                         ║
║  [0] ↩️  Voltar                                         ║
╚══════════════════════════════════════════════════════════╝
        """)
        
        choice = input("Escolha: ").strip()
        
        # === UPLOAD DIRETO ===
        if choice == "1":
            path = input("Caminho da foto (.jpg/.png): ").strip()
            if not os.path.isfile(path):
                print_error(f"Arquivo não encontrado: {path}")
                input("\nPressione Enter para continuar...")
                continue
            caption = input("Legenda: ").strip()
            if bot.upload_photo(path, caption):
                print_success("✅ Foto publicada no feed!")
            else:
                print_error("Falha ao publicar foto")
        
        elif choice == "2":
            path = input("Caminho do vídeo (.mp4/.mov): ").strip()
            if not os.path.isfile(path):
                print_error(f"Arquivo não encontrado: {path}")
                input("\nPressione Enter para continuar...")
                continue
            caption = input("Legenda: ").strip()
            if bot.upload_video(path, caption):
                print_success("✅ Vídeo publicado no feed!")
            else:
                print_error("Falha ao publicar vídeo")
        
        elif choice == "3":
            path = input("Caminho da foto (.jpg/.png): ").strip()
            if not os.path.isfile(path):
                print_error(f"Arquivo não encontrado: {path}")
                input("\nPressione Enter para continuar...")
                continue
            if bot.upload_story_photo(path):
                print_success("✅ Story de foto publicado!")
            else:
                print_error("Falha ao publicar story")
        
        elif choice == "4":
            path = input("Caminho do vídeo (.mp4/.mov): ").strip()
            if not os.path.isfile(path):
                print_error(f"Arquivo não encontrado: {path}")
                input("\nPressione Enter para continuar...")
                continue
            if bot.upload_story_video(path):
                print_success("✅ Story de vídeo publicado!")
            else:
                print_error("Falha ao publicar story de vídeo")
        
        elif choice == "5":
            path = input("Caminho do vídeo (.mp4/.mov): ").strip()
            if not os.path.isfile(path):
                print_error(f"Arquivo não encontrado: {path}")
                input("\nPressione Enter para continuar...")
                continue
            caption = input("Legenda do Reel: ").strip()
            if bot.upload_reel(path, caption):
                print_success("✅ Reel publicado!")
            else:
                print_error("Falha ao publicar Reel")
        
        # === AGENDAMENTO ===
        elif choice == "6":
            folder = input(f"Pasta de imagens [{config.CONTENT_FOLDER}]: ").strip()
            folder = folder or config.CONTENT_FOLDER
            ppd = int(input("Posts por dia [2]: ") or "2")
            bot.schedule_week_content(folder)
        elif choice == "7":
            print("Tipo de conteúdo:")
            print("  [1] Foto no Feed")
            print("  [2] Vídeo no Feed")
            print("  [3] Story")
            print("  [4] Reel")
            tipo_choice = input("Escolha o tipo [1]: ").strip() or "1"
            tipo_map = {"1": "photo", "2": "video", "3": "story", "4": "reel"}
            content_type = tipo_map.get(tipo_choice, "photo")
            
            path = input("Caminho do arquivo: ").strip()
            caption = input("Legenda (deixe em branco para automático): ").strip()
            when = input("Quando? (YYYY-MM-DD HH:MM): ").strip()
            if when:
                from datetime import datetime
                dt = datetime.strptime(when, "%Y-%m-%d %H:%M")
            else:
                dt = None
            bot.content_scheduler.schedule_post(path, caption or "", [], dt, content_type)
        elif choice == "8":
            posts = bot.content_scheduler.list_scheduled()
            if posts:
                print(f"\n{'ID':<20} {'Data':<20} {'Tipo':<10}")
                print("-" * 50)
                for p in posts:
                    from datetime import datetime
                    dt = datetime.fromisoformat(p.scheduled_time)
                    print(f"{p.id:<20} {dt.strftime('%d/%m %H:%M'):<20} {p.content_type:<10}")
            else:
                print_info("Nenhum post agendado")
        elif choice == "9":
            post_id = input("ID do post: ").strip()
            bot.content_scheduler.cancel_post(post_id)
        elif choice == "10":
            bot.content_scheduler.check_and_post()
        elif choice == "11":
            print_info("Iniciando daemon em thread separada...")
            daemon_thread = threading.Thread(
                target=bot.content_scheduler.run_scheduler_daemon,
                daemon=True
            )
            daemon_thread.start()
            print_success("Daemon iniciado! O sistema publicará automaticamente.")
        elif choice == "12":
            bot.content_scheduler.stop_daemon()
            print_success("Daemon parado!")
        elif choice == "0":
            break
        
        input("\nPressione Enter para continuar...")

def menu_analytics():
    """Menu de analytics"""
    while True:
        print("""
╔══════════════════════════════════════════════════════════╗
║  📊 MENU DE ANALYTICS                                    ║
╠══════════════════════════════════════════════════════════╣
║  [1] 🕐 Analisar Melhores Horários                       ║
║  [2] 📈 Analisar Performance dos Posts                   ║
║  [3] 📋 Relatório Completo                               ║
║  [4] 📤 Exportar Melhores Horários                       ║
║  [5] 📊 Estatísticas do Sistema                          ║
║  [0] ↩️  Voltar                                          ║
╚══════════════════════════════════════════════════════════╝
        """)
        
        choice = input("Escolha: ").strip()
        
        if choice == "1":
            bot.analytics_engine.analyze_follower_activity()
            bot.analytics_engine.calculate_best_posting_times()
        elif choice == "2":
            qty = int(input("Quantos posts analisar [9]: ") or "9")
            bot.analytics_engine.analyze_post_performance(qty)
        elif choice == "3":
            print(bot.analytics_engine.generate_report())
        elif choice == "4":
            times = bot.analytics_engine.export_best_times()
            print_info("Melhores horários:")
            for k, v in times.items():
                print(f"  {k}: {v}")
        elif choice == "5":
            stats = bot.get_stats()
            print("\n📊 Estatísticas do Sistema:")
            print(json.dumps(stats, indent=2, ensure_ascii=False, default=str))
        elif choice == "0":
            break
        
        input("\nPressione Enter para continuar...")

def menu_configuracoes():
    """Menu de configurações"""
    while True:
        print("""
╔══════════════════════════════════════════════════════════╗
║  ⚙️  MENU DE CONFIGURAÇÕES                               ║
╠══════════════════════════════════════════════════════════╣
║  [1] ➕ Adicionar Influenciador Alvo                     ║
║  [2] ➕ Adicionar Concorrente Alvo                       ║
║  [3] 🛡️  Adicionar à Whitelist                           ║
║  [4] 📋 Ver Whitelist                                    ║
║  [5] 🗑️  Remover da Whitelist                            ║
║  [6] 📊 Ver Estatísticas de Seguidores                   ║
║  [0] ↩️  Voltar                                          ║
╚══════════════════════════════════════════════════════════╝
        """)
        
        choice = input("Escolha: ").strip()
        
        if choice == "1":
            user = input("Username do influenciador: ").strip()
            niche = input("Nicho: ").strip()
            bot.growth_engine.add_target_influencer(user, niche)
        elif choice == "2":
            user = input("Username do concorrente: ").strip()
            bot.growth_engine.targets["concorrentes"].append(user)
            bot.growth_engine.save_targets()
            print_success(f"Concorrente @{user} adicionado")
        elif choice == "3":
            user = input("Username para proteger: ").strip()
            bot.followers_manager.add_to_whitelist(user)
        elif choice == "4":
            print(f"\n🛡️  Whitelist ({len(bot.followers_manager.whitelist)} usuários):")
            for user in sorted(bot.followers_manager.whitelist):
                print(f"  • @{user}")
        elif choice == "5":
            user = input("Username para remover: ").strip()
            bot.followers_manager.remove_from_whitelist(user)
        elif choice == "6":
            stats = bot.followers_manager.get_stats()
            print("\n📊 Estatísticas de Seguidores:")
            for k, v in stats.items():
                print(f"  {k}: {v}")
        elif choice == "0":
            break
        
        input("\nPressione Enter para continuar...")

def main():
    """Função principal"""
    global bot
    
    # Registra handler de sinal
    signal.signal(signal.SIGINT, signal_handler)
    
    # Banner
    print_banner()
    
    # Verifica requisitos
    if not check_requirements():
        sys.exit(1)
    
    # Inicializa bot
    print_info("Inicializando Instagram Growth Suite...")
    bot = InstagramBot()
    
    try:
        # Login
        print_info("Realizando login...")
        if not bot.login():
            print_error("Falha no login. Verifique suas credenciais.")
            sys.exit(1)
        
        print_success("Login realizado!")
        
        # Menu principal
        while True:
            print_menu()
            choice = input("Escolha: ").strip()
            
            if choice == "1":
                menu_crescimento()
            elif choice == "2":
                menu_configuracoes()
            elif choice == "3":
                menu_conteudo()
            elif choice == "4":
                menu_analytics()
            elif choice == "5":
                bot.analyze_and_report()
            elif choice == "0":
                break
            else:
                print_error("Opção inválida!")
    
    except KeyboardInterrupt:
        signal_handler(None, None)
    except Exception as e:
        print_error(f"Erro: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if bot:
            bot.quit()
        print("\n👋 Até logo!")

if __name__ == "__main__":
    main()
